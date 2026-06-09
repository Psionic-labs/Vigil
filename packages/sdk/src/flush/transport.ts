/**
 * @file transport.ts
 * @description Serialized transport for replay batches and one terminal unload dispatch.
 */
import type { SDKState } from "../client/state";
import type { IngestPayload } from "../types";

const inflightRequests = new Set<AbortController>();
let activeFlushPromise: Promise<void> | null = null;

interface BatchTransportOptions {
  keepalive?: boolean;
}

function logRejectedPayload(
  payload: IngestPayload,
  state: SDKState,
  debug: boolean,
): void {
  if (!debug) return;

  console.warn("[Transport] Rejected post-finalization payload", {
    sessionId: payload.sessionId,
    payloadType: payload.isFinal ? "final" : "non-final",
    lifecycle: state.lifecycle,
    eventCount: payload.events.length,
    summaryCount: payload.summary.length,
  });
}

function trackSerializedSend(send: Promise<boolean>): Promise<boolean> {
  const completion = send.then(
    () => undefined,
    () => undefined,
  );
  activeFlushPromise = completion;
  void completion.then(() => {
    if (activeFlushPromise === completion) {
      activeFlushPromise = null;
    }
  });
  return send;
}

async function postBatch(
  endpoint: string,
  payload: IngestPayload,
  debug: boolean,
  state: SDKState,
  options: BatchTransportOptions,
): Promise<boolean> {
  if (payload.isFinal || state.lifecycle !== "active") {
    logRejectedPayload(payload, state, debug);
    return false;
  }

  const controller = new AbortController();
  inflightRequests.add(controller);
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive: options.keepalive,
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
    if (debug && state.lifecycle === "active") {
      console.warn("Vigil flush: network error", err);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
    inflightRequests.delete(controller);
  }
}

/**
 * Send a non-terminal batch. Calls are serialized so only one standard POST is
 * active at once; queued work checks lifecycle again immediately before fetch.
 */
export function sendBatch(
  endpoint: string,
  payload: IngestPayload,
  debug: boolean,
  state: SDKState,
  options: BatchTransportOptions = {},
): Promise<boolean> {
  const run = () => postBatch(endpoint, payload, debug, state, options);

  if (!activeFlushPromise) {
    return trackSerializedSend(run());
  }

  return trackSerializedSend(activeFlushPromise.then(run, run));
}

/** Abort the active standard POST before terminal payload dispatch. */
export function abortInflightRequests(): void {
  for (const controller of inflightRequests) {
    controller.abort();
  }
}

/**
 * Best-effort one-time send during page unload or explicit terminal shutdown.
 * It stays synchronous because unload handlers cannot reliably await work.
 */
export function sendFinalBatch(
  endpoint: string,
  payload: IngestPayload,
  debug: boolean,
  state: SDKState,
): boolean {
  if (
    !payload.isFinal ||
    state.lifecycle !== "finalizing" ||
    state.terminalPayloadDispatched
  ) {
    logRejectedPayload(payload, state, debug);
    return false;
  }
  state.terminalPayloadDispatched = true;

  const encoder = new TextEncoder();
  let events = payload.events;
  let summary = payload.summary;
  let body = JSON.stringify(payload);
  let bodyBytes = encoder.encode(body).length;

  const MAX_PAYLOAD_BYTES = 60000;
  if (bodyBytes > MAX_PAYLOAD_BYTES && events.length > 0) {
    if (debug) {
      console.warn(
        `Vigil final flush: payload too large (${bodyBytes} bytes), dropping raw rrweb events`,
      );
    }
    events = [];
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
      summary = summary.length === 1
        ? []
        : summary.slice(-Math.floor(summary.length / 2));
      body = JSON.stringify({ ...payload, events, summary });
      bodyBytes = encoder.encode(body).length;
    }
  }

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

    if (queued) return true;
  }

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
    if (debug) {
      console.warn("Vigil final flush: both sendBeacon and fetch failed");
    }
  }

  return true;
}
