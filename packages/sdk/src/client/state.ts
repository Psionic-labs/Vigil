/**
 * @file state.ts
 * @description Handles internal event caches, summary bounds, and status flags.
 * @why Stores session metadata and aggregates errors/clicks for flushes.
 */

import type { SummaryEvent, SessionMetadata } from "../types";

// Derive the event type from rrweb's own record signature
import type { record } from "rrweb";
type RecordOptions = NonNullable<Parameters<typeof record>[0]>;
export type RrwebEvent = NonNullable<RecordOptions["emit"]> extends (...args: infer A) => void ? (A extends [infer E, ...unknown[]] ? E : never) : never;

export const MAX_EVENTS = 5000;
export const MAX_SUMMARY = 1000;
export const SUMMARY_TRIM_BATCH_SIZE = 50;

export type SessionLifecycle = "active" | "finalizing" | "finalized";

export interface SDKState {
  initialized: boolean;
  sessionId: string;
  events: RrwebEvent[];
  summaryEvents: SummaryEvent[];
  metadata: SessionMetadata | null;
  /**
   * Only active sessions can collect data or dispatch non-terminal payloads.
   */
  lifecycle: SessionLifecycle;
  /**
   * Transport-level single-dispatch lock for the terminal payload.
   */
  terminalPayloadDispatched: boolean;
  lifecycleEpoch: number;
}

export function createSDKState(): SDKState {
  const events: RrwebEvent[] = [];
  const state: SDKState = {
    initialized: false,
    sessionId: "",
    events,
    summaryEvents: [],
    metadata: null,
    lifecycle: "active",
    terminalPayloadDispatched: false,
    lifecycleEpoch: 0,
  };

  // Guard every detector's shared queue without requiring detector-specific lifecycle wiring.
  state.summaryEvents = new Proxy([] as SummaryEvent[], {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (prop === "push") {
        return (...items: SummaryEvent[]) => {
          if (state.lifecycle !== "active") {
            return target.length;
          }
          const res = Array.prototype.push.apply(target, items);
          if (target.length > MAX_SUMMARY) {
            target.splice(0, target.length - MAX_SUMMARY + SUMMARY_TRIM_BATCH_SIZE);
          }
          return res;
        };
      }
      return val;
    },
  });

  return state;
}
