/**
 * @file final-flush.ts
 * @description Handles terminal data flushing during browser unload events (`pagehide`, `beforeunload`).
 * Also manages non-destructive opportunistic "visibility" flushes when the tab is hidden, ensuring 
 * data is not lost if mobile operating systems terminate the backgrounded browser process.
 */
import { sendFinalBatch } from "./transport";
import type { FlushContext, FlushTimer } from "./shared";
import { buildPayload, buildSnapshotPayload, restoreBuffer } from "./shared";
import type { SDKState } from "../client/state";

export function setupFinalFlush(
  ctx: FlushContext,
  timer: FlushTimer,
  state: SDKState
): { cleanup: () => void; triggerFinalFlush: () => void } {
  if (typeof window === "undefined") {
    return { cleanup: () => {}, triggerFinalFlush: () => {} };
  }

  let lastVisibilityFlush = 0;
  const VISIBILITY_FLUSH_DEBOUNCE_MS = 5000;

  const doVisibilityFlush = () => {
    if (document.visibilityState !== "hidden") return;
    
    const now = Date.now();
    if (now - lastVisibilityFlush < VISIBILITY_FLUSH_DEBOUNCE_MS) return;
    lastVisibilityFlush = now;

    // Do NOT set state.finalFlushSent = true here.
    // We want the session to remain alive if the user returns.
    const result = buildSnapshotPayload(ctx);
    if (!result) return;

    sendFinalBatch(ctx.endpoint, result.payload, ctx.debug);
  };

  const doFinalFlush = (event?: PageTransitionEvent | BeforeUnloadEvent) => {
    // Guard: bfcache restore (page coming back from cache)
    if (event && "persisted" in event && event.persisted === true) return;

    // Guard: both pagehide and beforeunload can fire on the same close,
    // or programmatic shutdown can be called. We only want to flush once.
    // [j76y39] After a terminal flush attempt, the SDK prevents any future periodic or retry-based flush activity for that session lifecycle.
    if (state.finalFlushSent) return;
    state.finalFlushSent = true;

    // Stop the periodic timer so it doesn't race with us.
    timer.stop();

    // Recover any batch that was in-flight during a periodic flush
    const inFlight = timer.getInFlight();
    if (inFlight) {
      restoreBuffer(ctx.events, inFlight.events);
      restoreBuffer(ctx.summaryEvents, inFlight.summary);
    }

    const result = buildPayload(ctx, true);
    if (!result) return;

    sendFinalBatch(ctx.endpoint, result.payload, ctx.debug);
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
