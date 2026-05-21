import type { SummaryEvent } from "../types";
import { sendBatch } from "./transport";
import type { SDKState } from "../client/state";
import {
  type FlushContext,
  type FlushTimer,
  buildPayload,
  restoreBuffer
} from "./shared";

export * from "./transport";
export * from "./final-flush";
export * from "./shared";

// Periodic flush

/**
 * Start the periodic flush loop.
 *
 * @returns A `FlushTimer` object to manage the interval and access in-flight state.
 */
export function startFlushTimer(
  ctx: FlushContext,
  intervalMs: number,
  state: SDKState
): FlushTimer {
  let consecutiveFailures = 0;
  const MAX_RETRIES = 3;
  let isFlushing = false; // Lock to prevent overlapping network requests
  let currentInFlight: { events: unknown[]; summary: SummaryEvent[] } | null = null;

  // Start tick loop...
  const tick = async () => {
    // Capture the epoch to ensure we don't restore data if the lifecycle restarts
    const currentEpoch = state.lifecycleEpoch;

    // [j76y39] After a terminal flush attempt, the SDK prevents any future periodic or retry-based flush activity for that session lifecycle.
    // If a request is hanging on a bad connection, or a final flush has been sent/attempted, we immediately ignore this tick.
    if (isFlushing || state.finalFlushSent) return;

    const result = buildPayload(ctx, false);
    if (!result) return;

    isFlushing = true;
    const { payload, events, summary } = result;
    currentInFlight = { events, summary };

    const ok = await sendBatch(ctx.endpoint, payload, ctx.debug);

    currentInFlight = null;
    isFlushing = false;

    // If the lifecycle epoch has changed (e.g., shutdown was called), silently drop the batch
    if (currentEpoch !== state.lifecycleEpoch) return;

    if (!ok) {
      consecutiveFailures++;
      // [j76y39] After a terminal flush attempt, the SDK prevents any future periodic or retry-based flush activity for that session lifecycle.
      // Therefore, if state.finalFlushSent is true, we immediately bypass retry scheduling and restoration, allowing the failed batch to be dropped.
      if (consecutiveFailures <= MAX_RETRIES && !state.finalFlushSent) {
        if (ctx.debug) {
          console.warn(
            `Vigil flush: network failed, re-queueing (retry ${consecutiveFailures}/${MAX_RETRIES})`,
          );
        }
        restoreBuffer(ctx.events, events);
        restoreBuffer(ctx.summaryEvents, summary);
      } else {
        if (ctx.debug) {
          if (state.finalFlushSent) {
            console.log("Vigil flush: dropping failed batch because final flush was already sent");
          } else {
            console.error(
              `Vigil flush: endpoint unreachable, dropping batch after ${MAX_RETRIES} retries`,
            );
          }
        }
        consecutiveFailures = 0;
      }
    } else {
      consecutiveFailures = 0; // Reset on success
    }
  };

  let id: ReturnType<typeof setInterval> | null = setInterval(tick, intervalMs);

  return {
    stop: () => {
      if (id) {
        clearInterval(id);
        id = null;
      }
    },
    getInFlight: () => currentInFlight,
  };
}
