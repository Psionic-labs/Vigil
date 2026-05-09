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
  debug?: boolean;
}

// Track initialization to prevent duplicate rrweb observers
let initialized = false;

export function init(options: VigilOptions) {
  // SSR guard: rrweb requires browser globals
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (!options.projectKey) {
    console.error("Vigil SDK: projectKey is required.");
    return;
  }

  // Prevent duplicate rrweb record() calls (e.g. React StrictMode, HMR)
  if (initialized) {
    if (options.debug) console.warn("Vigil SDK: already initialized, skipping.");
    return;
  }
  initialized = true;

  if (options.debug) {
    console.log("Vigil SDK initialized with project key:", options.projectKey);
  }

  const events: RrwebEvent[] = [];

  // Start recording DOM mutations, mouse movements, and interactions
  const stopRecording = record({
    emit(event: RrwebEvent) {
      events.push(event);
    },
    // maskAllInputs will be enabled when that roadmap item is implemented
  });

  // Expose to window for debugging during early development
  if (options.debug) {
    (window as { __vigil?: unknown }).__vigil = {
      events,
      stopRecording,
    };
  }
}
