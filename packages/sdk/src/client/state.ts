import type { SummaryEvent, SessionMetadata } from "../types";

// Derive the event type from rrweb's own record signature
import { record } from "rrweb";
type RecordOptions = NonNullable<Parameters<typeof record>[0]>;
export type RrwebEvent = NonNullable<RecordOptions["emit"]> extends (e: infer E, ...args: any[]) => void ? E : never;

export const MAX_EVENTS = 5000;
export const MAX_SUMMARY = 1000;
export const SUMMARY_TRIM_BATCH_SIZE = 50;

export interface SDKState {
  initialized: boolean;
  sessionId: string;
  events: RrwebEvent[];
  summaryEvents: SummaryEvent[];
  metadata: SessionMetadata | null;
}

export function createSDKState(): SDKState {
  const events: RrwebEvent[] = [];
  
  // Use a Proxy to enforce buffer limits universally on the array.
  const summaryEvents = new Proxy([] as SummaryEvent[], {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (prop === "push") {
        return (...items: SummaryEvent[]) => {
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

  return {
    initialized: false,
    sessionId: "",
    events,
    summaryEvents,
    metadata: null,
  };
}
