/**
 * @file final-flush.ts
 * @description Handles terminal data flushing during browser unload events (`pagehide`, `beforeunload`).
 * Also manages non-destructive opportunistic "visibility" flushes when the tab is hidden, ensuring 
 * data is not lost if mobile operating systems terminate the backgrounded browser process.
 */
import { abortInflightRequests, sendBatch, sendFinalBatch } from "./transport";
import type { FlushContext, FlushTimer } from "./shared";
import { buildPayload, buildSnapshotPayload, cancelAllScheduledFlushes } from "./shared";
import type { SDKState } from "../client/state";

export function setupFinalFlush(
  ctx: FlushContext,
  timer: FlushTimer,
  state: SDKState,
  onFinalizing?: () => void,
): { cleanup: () => void; triggerFinalFlush: () => void } {
  if (typeof window === "undefined") {
    return { cleanup: () => { }, triggerFinalFlush: () => { } };
  }

  let lastVisibilityFlush = 0;
  const VISIBILITY_FLUSH_DEBOUNCE_MS = 5000;

  const doVisibilityFlush = () => {
    if (state.lifecycle !== "active") return;
    if (document.visibilityState !== "hidden") return;

    const now = Date.now();
    if (now - lastVisibilityFlush < VISIBILITY_FLUSH_DEBOUNCE_MS) return;
    lastVisibilityFlush = now;

    const result = buildSnapshotPayload(ctx);
    if (!result) return;

    void sendBatch(ctx.endpoint, result.payload, ctx.debug, state, { keepalive: true });
  };

  const doFinalFlush = (event?: PageTransitionEvent | BeforeUnloadEvent) => {
    // Guard: bfcache restore (page coming back from cache)
    if (event && "persisted" in event && event.persisted === true) return;

    // Both unload events and programmatic shutdown can race in the same task.
    if (state.lifecycle !== "active") return;
    state.lifecycle = "finalizing";
    state.lifecycleEpoch++;

    const inFlight = timer.getInFlight();

    cancelAllScheduledFlushes();
    timer.stop();
    abortInflightRequests();

    try {
      onFinalizing?.();
      const result = buildPayload(ctx, true);
      if (!result) return;

      const payload = inFlight
        ? {
            ...result.payload,
            events: [...inFlight.events, ...result.payload.events],
            summary: [...inFlight.summary, ...result.payload.summary],
          }
        : result.payload;

      sendFinalBatch(ctx.endpoint, payload, ctx.debug, state);
    } finally {
      state.lifecycle = "finalized";
    }
  };

  window.addEventListener("pagehide", doFinalFlush);
  window.addEventListener("beforeunload", doFinalFlush);
  document.addEventListener("visibilitychange", doVisibilityFlush);

  return {
    cleanup: () => {
      window.removeEventListener("pagehide", doFinalFlush);
      window.removeEventListener("beforeunload", doFinalFlush);
      document.removeEventListener("visibilitychange", doVisibilityFlush);
    },
    triggerFinalFlush: () => doFinalFlush(),
  };
}
