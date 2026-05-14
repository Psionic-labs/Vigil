/**
 * flush.ts
 *
 * Handles all flushing of buffered rrweb events and summary events
 * to the Vigil ingest endpoint.
 *
 * Two flush modes:
 *
 *  1. **Periodic** (`startFlushTimer`) — fires every `flushInterval` ms via
 *     `setInterval`. Uses normal `fetch`. On failure, events are pushed back
 *     into the buffers for the next tick. Returns a `stop()` function.
 *
 *  2. **Final** (`setupFinalFlush`) — fires once on tab close / navigation
 *     away. Listens to `pagehide` (modern, bfcache-aware) and `beforeunload`
 *     (legacy fallback). Uses `navigator.sendBeacon` when available, falls
 *     back to `fetch` with `keepalive: true`. Sends `isFinal: true` so the
 *     backend knows to close the session and queue AI triage.
 *
 * Both modes share `buildPayload` and `drain` so the wire format is always
 * consistent.
 */

import type { SummaryEvent, IngestPayload, SessionMetadata } from "./types";
import { sanitizeUrl } from "./utils";

// Shared context

/** Context that `init()` passes in so flush knows what to send. */
export interface FlushContext {
  sessionId: string;
  projectKey: string;
  endpoint: string;
  sdkVersion: string;
  events: unknown[];
  summaryEvents: SummaryEvent[];
  metadata: SessionMetadata;
  debug: boolean;
}

// Shared helpers

/**
 * O(N) stack-safe array restore. Prevents "Maximum call stack size exceeded"
 * on massive telemetry arrays and avoids O(N^2) unshift loop freezes.
 *
 * It puts `items` at the beginning of `buffer`.
 */
function restoreBuffer<T>(buffer: T[], items: T[]): void {
  const original = [...buffer];
  buffer.length = 0;
  // Combine items (new batch) + original (old buffer)
  // push(...items) is usually safe for ~10k items, but for absolute safety
  // we could use a loop. For Vigil's 5k limit, this is fine.
  for (const item of items) buffer.push(item);
  for (const item of original) buffer.push(item);
}

/**
 * Drain an array in-place and return the removed items.
 * This is the atomic "take all and clear" primitive for both buffers.
 */
function drain<T>(buffer: T[]): T[] {
  return buffer.splice(0, buffer.length);
}

/**
 * Build an `IngestPayload` by draining both buffers.
 * Returns `null` if both buffers are empty (nothing to send).
 */
function buildPayload(
  ctx: FlushContext,
  isFinal: boolean,
): {
  payload: IngestPayload;
  events: unknown[];
  summary: SummaryEvent[];
} | null {
  if (typeof window !== "undefined" && window.location) {
    // Keep metadata URL fresh for SPAs (strips query/hash params for privacy)
    ctx.metadata.url = sanitizeUrl(window.location.href);
  }

  const events = drain(ctx.events);
  const summary = drain(ctx.summaryEvents);

  if (events.length === 0 && summary.length === 0) {
    return null;
  }

  const payload: IngestPayload = {
    sessionId: ctx.sessionId,
    projectKey: ctx.projectKey,
    events,
    summary,
    metadata: ctx.metadata,
    isFinal,
    sdkVersion: ctx.sdkVersion,
  };

  return { payload, events, summary };
}

// Transport: normal fetch

/**
 * Send one batch to the ingest endpoint via `fetch`.
 *
 * Returns `true` on success (2xx), `false` on failure.
 * Never throws.
 */
async function sendBatch(
  endpoint: string,
  payload: IngestPayload,
  debug: boolean,
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (debug) {
        console.warn(
          "Vigil flush: ingest returned",
          res.status,
          await res.text().catch(() => ""),
        );
      }
      return false;
    }

    if (debug) {
      console.log(
        "Vigil flush: sent",
        payload.events.length,
        "events,",
        payload.summary.length,
        "summary",
      );
    }
    return true;
  } catch (err) {
    if (debug) {
      console.warn("Vigil flush: network error", err);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Transport: sendBeacon / fetch+keepalive (for unload)

/**
 * Best-effort send during page unload.
 *
 * Priority:
 *  1. `navigator.sendBeacon` — purpose-built for unload, works reliably.
 *  2. `fetch` with `keepalive: true` — keeps the request alive after the
 *     page is gone. Supported in Chrome 66+, Firefox 120+, Safari 13+.
 *
 * Both are fire-and-forget with no response handling.
 */
function sendFinal(
  endpoint: string,
  payload: IngestPayload,
  debug: boolean,
): void {
  const encoder = new TextEncoder();
  let body = JSON.stringify(payload);
  let bodyBytes = encoder.encode(body).length;

  // Chromium/Safari beacon and keepalive limit is exactly 64KB.
  // We trim payload if it exceeds 60KB to guarantee delivery of summary triage signals.
  const MAX_PAYLOAD_BYTES = 60000;
  if (bodyBytes > MAX_PAYLOAD_BYTES && payload.events.length > 0) {
    if (debug) {
      console.warn(
        `Vigil final flush: payload too large (${bodyBytes} bytes), dropping raw rrweb events`,
      );
    }
    payload.events = []; // Drop opaque blobs, prioritize structured triage
    body = JSON.stringify(payload);
    bodyBytes = encoder.encode(body).length;

    if (bodyBytes > MAX_PAYLOAD_BYTES) {
      // Extreme fallback: trim summary array if somehow still > 60KB
      payload.summary = payload.summary.slice(-100);
      body = JSON.stringify(payload);
    }
  }

  // Try sendBeacon first
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const blob = new Blob([body], { type: "application/json" });
    const queued = navigator.sendBeacon(endpoint, blob);

    if (debug) {
      console.log(
        "Vigil final flush: sendBeacon",
        queued ? "queued" : "rejected",
        `(${payload.events.length} events, ${payload.summary.length} summary)`,
      );
    }

    if (queued) return;
    // sendBeacon can reject if payload is too large (64KB limit in some browsers).
    // Fall through to fetch+keepalive.
  }

  // Fallback: fetch with keepalive
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (debug) {
      console.log(
        "Vigil final flush: fetch+keepalive sent",
        `(${payload.events.length} events, ${payload.summary.length} summary)`,
      );
    }
  } catch {
    // Nothing more we can do during unload.
    if (debug) {
      console.warn("Vigil final flush: both sendBeacon and fetch failed");
    }
  }
}

// Periodic flush

export interface FlushTimer {
  stop: () => void;
  getInFlight: () => { events: unknown[]; summary: SummaryEvent[] } | null;
}

/**
 * Start the periodic flush loop.
 *
 * @returns A `FlushTimer` object to manage the interval and access in-flight state.
 */
export function startFlushTimer(
  ctx: FlushContext,
  intervalMs: number,
): FlushTimer {
  let consecutiveFailures = 0;
  const MAX_RETRIES = 3;
  let isFlushing = false; // Lock to prevent overlapping network requests
  let currentInFlight: { events: unknown[]; summary: SummaryEvent[] } | null = null;

  // Start tick loop...
  const tick = async () => {
    // If a request is hanging on a bad connection, skip this tick.
    // Events will safely accumulate in the buffer without creating a thundering herd.
    if (isFlushing) return;

    const result = buildPayload(ctx, false);
    if (!result) return;

    isFlushing = true;
    const { payload, events, summary } = result;
    currentInFlight = { events, summary };

    const ok = await sendBatch(ctx.endpoint, payload, ctx.debug);

    currentInFlight = null;

    if (!ok) {
      consecutiveFailures++;
      if (consecutiveFailures <= MAX_RETRIES) {
        if (ctx.debug) {
          console.warn(
            `Vigil flush: network failed, re-queueing (retry ${consecutiveFailures}/${MAX_RETRIES})`,
          );
        }
        restoreBuffer(ctx.events, events);
        restoreBuffer(ctx.summaryEvents, summary);
      } else {
        if (ctx.debug) {
          console.error(
            `Vigil flush: endpoint unreachable, dropping batch after ${MAX_RETRIES} retries`,
          );
        }
        consecutiveFailures = 0;
      }
    } else {
      consecutiveFailures = 0; // Reset on success
    }

    isFlushing = false;
  };

  const id = setInterval(tick, intervalMs);

  return {
    stop: () => clearInterval(id),
    getInFlight: () => currentInFlight,
  };
}

// Final flush (page unload)

/**
 * Attach `pagehide` and `beforeunload` listeners that perform a final flush
 * with `isFinal: true` when the tab is closing or navigating away.
 *
 * @param ctx       — shared flush context (same reference as the periodic timer)
 * @param timer     — the `FlushTimer` returned by `startFlushTimer`,
 *                    called before draining to prevent a race with the interval
 *
 * @returns A cleanup function that removes the event listeners.
 */
export function setupFinalFlush(
  ctx: FlushContext,
  timer: FlushTimer,
): () => void {
  if (typeof window === "undefined") return () => {};

  let flushed = false;

  const doFinalFlush = (event?: PageTransitionEvent | BeforeUnloadEvent) => {
    // Guard: bfcache restore (page coming back from cache)
    if (event && 'persisted' in event && event.persisted === true) return;

    // Guard: both pagehide and beforeunload can fire on the same close.
    // We only want to flush once.
    if (flushed) return;
    flushed = true;

    // Stop the periodic timer so it doesn't race with us.
    timer.stop();

    // Recover any batch that was in-flight during a periodic flush
    // The browser might cancel the in-flight fetch when the tab closes, so we must
    // include those events in the sendBeacon payload to prevent data loss.
    const inFlight = timer.getInFlight();
    if (inFlight) {
      // Use stack-safe recovery to prevent "Maximum call stack size exceeded"
      restoreBuffer(ctx.events, inFlight.events);
      restoreBuffer(ctx.summaryEvents, inFlight.summary);
    }

    const result = buildPayload(ctx, true);
    if (!result) return;

    sendFinal(ctx.endpoint, result.payload, ctx.debug);
  };

  // pagehide is the modern event — it fires reliably on mobile and respects
  // bfcache. beforeunload is the legacy fallback for older browsers.
  window.addEventListener("pagehide", doFinalFlush);
  window.addEventListener("beforeunload", doFinalFlush);

  return () => {
    window.removeEventListener("pagehide", doFinalFlush);
    window.removeEventListener("beforeunload", doFinalFlush);
  };
}
