import { record } from "rrweb";
import { getOrCreateSessionId } from "./session";
import { startFlushTimer, setupFinalFlush } from "./flush";
import type { VigilOptions, SummaryEvent, SessionMetadata } from "./types";

export type { VigilOptions, SummaryEvent, SessionMetadata };

// Derive the event type from rrweb's own record signature - no separate @rrweb/types import needed
type RecordOptions = NonNullable<Parameters<typeof record>[0]>;
type RrwebEvent = NonNullable<RecordOptions["emit"]> extends (e: infer E, ...args: any[]) => void ? E : never;

/**
 * @vigil/sdk
 * Core SDK for Vigil analytics and bug triage.
 */

// SDK version — embedded in every ingest payload per the contract.
const SDK_VERSION = "0.1.0";

// Defaults from the SDK contract (docs/vigil-sdk-contract.md)
const DEFAULT_ENDPOINT = "https://ingest.usevigilhq.com/api/ingest";
const DEFAULT_FLUSH_INTERVAL = 5000;

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

  // Resolve (or create) the session ID before doing anything else.
  // This is stable for the entire tab lifetime.
  const sessionId = getOrCreateSessionId();

  const debug = options.debug ?? false;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const flushInterval = options.flushInterval ?? DEFAULT_FLUSH_INTERVAL;

  if (debug) {
    console.log("Vigil SDK initialized", { projectKey: options.projectKey, sessionId, endpoint, flushInterval });
  }

  // ---- Buffers ----
  // rrweb raw events (opaque blobs for replay)
  const events: RrwebEvent[] = [];
  // Summary events (structured signals consumed by AI triage)
  const summaryEvents: SummaryEvent[] = [];

  // ---- Session metadata (captured once at init) ----
  const metadata: SessionMetadata = {
    url: window.location.href,
    userAgent: navigator.userAgent,
    startedAt: Date.now(),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    environment: options.environment,
    release: options.release,
    commitSha: options.commitSha,
    userId: options.userId,
  };

  // ---- Start recording ----
  const stopRecording = record({
    emit(event: RrwebEvent) {
      events.push(event);
    },
    // maskAllInputs will be enabled when that roadmap item is implemented
  });

  // ---- Shared flush context (referenced by both timer and final flush) ----
  const flushCtx = {
    sessionId,
    projectKey: options.projectKey,
    endpoint,
    sdkVersion: SDK_VERSION,
    events,
    summaryEvents,
    metadata,
    debug,
  };

  // ---- Start periodic flush ----
  const stopFlushing = startFlushTimer(flushCtx, flushInterval);

  // ---- Attach final flush on tab close / navigation away ----
  const removeFinalFlush = setupFinalFlush(flushCtx, stopFlushing);

  // Expose to window for debugging during early development
  if (debug) {
    (window as { __vigil?: unknown }).__vigil = {
      sessionId,
      events,
      summaryEvents,
      metadata,
      stopRecording,
      stopFlushing,
      removeFinalFlush,
    };
  }
}
