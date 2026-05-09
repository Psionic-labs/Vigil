import { record } from "rrweb";

// Derive the event type from rrweb's own record signature - no separate @rrweb/types import needed
type RecordOptions = NonNullable<Parameters<typeof record>[0]>;
type RrwebEvent = NonNullable<RecordOptions["emit"]> extends (e: infer E, ...args: any[]) => void ? E : never;

/**
 * @vigil/sdk
 * Core SDK for Vigil analytics and bug triage.
 */

export interface VigilOptions {
  projectKey: string;
}

export function init(options: VigilOptions) {
  if (!options.projectKey) {
    console.error("Vigil SDK: projectKey is required.");
    return;
  }
  
  console.log("Vigil SDK initialized with project key:", options.projectKey);

  const events: RrwebEvent[] = [];

  // Start recording DOM mutations, mouse movements, and interactions
  const stopRecording = record({
    emit(event: RrwebEvent) {
      events.push(event);
    },
    // By default, we might want to mask all inputs to protect PII
    // maskAllInputs: true,
  });

  // Expose to window for debugging during early development
  if (typeof window !== "undefined") {
    (window as any).__vigil = {
      events,
      stopRecording,
    };
  }
}
