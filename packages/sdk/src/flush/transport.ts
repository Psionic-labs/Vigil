/**
 * @file transport.ts
 * @description The low-level network layer of the SDK.
 * Implements `fetch` with AbortControllers for standard periodic flushes, and 
 * fallbacks via `navigator.sendBeacon` and `keepalive` for final unload flushes.
 * Enforces strict 64KB payload limits for beacon requests.
 */
import type { IngestPayload } from "../types";

/**
 * Send one batch to the ingest endpoint via `fetch`.
 *
 * Returns `true` on success (2xx), `false` on failure.
 * Never throws.
 */
export async function sendBatch(
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

/**
 * Best-effort send during page unload or final flush.
 *
 * Priority:
 *  1. `navigator.sendBeacon` — purpose-built for unload, works reliably.
 *  2. `fetch` with `keepalive: true` — keeps the request alive after the
 *     page is gone. Supported in Chrome 66+, Firefox 120+, Safari 13+.
 *
 * Both are fire-and-forget with no response handling.
 */
export function sendFinalBatch(
  endpoint: string,
  payload: IngestPayload,
  debug: boolean,
): void {
  const encoder = new TextEncoder();
  let events = payload.events;
  let summary = payload.summary;
  let body = JSON.stringify(payload);
  let bodyBytes = encoder.encode(body).length;

  // Chromium/Safari beacon and keepalive limit is exactly 64KB.
  // We trim payload if it exceeds 60KB to guarantee delivery of summary triage signals.
  const MAX_PAYLOAD_BYTES = 60000;
  if (bodyBytes > MAX_PAYLOAD_BYTES && events.length > 0) {
    if (debug) {
      console.warn(
        `Vigil final flush: payload too large (${bodyBytes} bytes), dropping raw rrweb events`,
      );
    }
    events = []; // Drop opaque blobs, prioritize structured triage
    body = JSON.stringify({ ...payload, events, summary });
    bodyBytes = encoder.encode(body).length;
  }

  if (bodyBytes > MAX_PAYLOAD_BYTES && summary.length > 0) {
    if (debug) {
      console.warn(
        `Vigil final flush: payload still too large (${bodyBytes} bytes), trimming summary`,
      );
    }
    while (bodyBytes > MAX_PAYLOAD_BYTES && summary.length > 0) {
      if (summary.length === 1) {
        summary = [];
      } else {
        summary = summary.slice(-Math.floor(summary.length / 2));
      }
      body = JSON.stringify({ ...payload, events, summary });
      bodyBytes = encoder.encode(body).length;
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
        `(${events.length} events, ${summary.length} summary)`,
      );
    }

    if (queued) return;
    // sendBeacon can reject if payload is too large (64KB limit in some browsers).
    // Fall through to fetch+keepalive.
  }

  // Fallback: fetch with keepalive
  try {
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});

    if (debug) {
      console.log(
        "Vigil final flush: fetch+keepalive sent",
        `(${events.length} events, ${summary.length} summary)`,
      );
    }
  } catch {
    // Nothing more we can do during unload.
    if (debug) {
      console.warn("Vigil final flush: both sendBeacon and fetch failed");
    }
  }
}
