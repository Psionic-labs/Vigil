/**
 * @file index.ts
 * @description Controls periodic background event queue flushes.
 * @why Optimizes network transfers by batching beacons.
 */

import type { SummaryEvent } from "../types";
import { sendBatch } from "./transport";
import type { SDKState } from "../client/state";
import {
  type FlushContext,
  type FlushTimer,
  buildPayload,
  registerScheduledFlushCleanup,
  restoreBuffer,
  unregisterScheduledFlushCleanup,
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

    if (isFlushing || state.lifecycle !== "active") return;

    const result = buildPayload(ctx, false);
    if (!result) return;

    isFlushing = true;
    const { payload, events, summary } = result;
    currentInFlight = { events, summary };

    const ok = await sendBatch(ctx.endpoint, payload, ctx.debug, state);

    currentInFlight = null;
    isFlushing = false;

    // A terminal transition owns the drained batch once it begins.
    if (currentEpoch !== state.lifecycleEpoch || state.lifecycle !== "active") return;

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
  };

  let id: ReturnType<typeof setInterval> | null = setInterval(tick, intervalMs);
  const stop = () => {
    if (id) {
      clearInterval(id);
      id = null;
    }
    unregisterScheduledFlushCleanup(stop);
  };
  registerScheduledFlushCleanup(stop);

  return {
    stop,
    getInFlight: () => currentInFlight,
  };
}
