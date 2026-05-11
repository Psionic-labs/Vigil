import { record } from "rrweb";
import { getOrCreateSessionId } from "./session";
import { startFlushTimer, setupFinalFlush } from "./flush";
import { setupErrorCapture } from "./errors";
import { setupConsoleCapture } from "./console";
import { sanitizeUrl } from "./utils";
import type { VigilOptions, SummaryEvent, SessionMetadata } from "./types";

export type { VigilOptions, SummaryEvent, SessionMetadata };

// Derive the event type from rrweb's own record signature - no separate @rrweb/types import needed
type RecordOptions = NonNullable<Parameters<typeof record>[0]>;
type RrwebEvent =
  NonNullable<RecordOptions["emit"]> extends (
    e: infer E,
    ...args: any[]
  ) => void
    ? E
    : never;

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
    if (options.debug)
      console.warn("Vigil SDK: already initialized, skipping.");
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
    console.log("Vigil SDK initialized", {
      projectKey: options.projectKey,
      sessionId,
      endpoint,
      flushInterval,
    });
  }

  // Buffers
  // rrweb raw events (opaque blobs for replay)
  const events: RrwebEvent[] = [];
  const MAX_EVENTS = 5000;

  // Summary events (structured signals consumed by AI triage)
  const MAX_SUMMARY = 1000;
  const SUMMARY_TRIM_BATCH_SIZE = 50;

  // Use a Proxy to enforce buffer limits universally on the array.
  // This traps .push() regardless of whether it's called by name or reference.
  const summaryEvents = new Proxy([] as SummaryEvent[], {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (prop === "push") {
        return (...items: SummaryEvent[]) => {
          const res = Array.prototype.push.apply(target, items);
          if (target.length > MAX_SUMMARY) {
            target.splice(
              0,
              target.length - MAX_SUMMARY + SUMMARY_TRIM_BATCH_SIZE,
            );
          }
          return res;
        };
      }
      return val;
    },
  });

  // Session metadata (captured once at init)
  const metadata: SessionMetadata = {
    url: sanitizeUrl(window.location.href),
    userAgent: navigator.userAgent,
    startedAt: Date.now(),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    environment: options.environment,
    release: options.release,
    commitSha: options.commitSha,
    userId: options.userId,
  };

  // Start recording safely
  let stopRecording: (() => void) | undefined;
  try {
    stopRecording = record({
      emit(event: RrwebEvent) {
        if (events.length > MAX_EVENTS) {
          // Prevent unbounded memory growth if fetch hangs
          events.splice(0, events.length - MAX_EVENTS + 100);
        }
        events.push(event);
      },
      maskAllInputs: options.maskAllInputs !== false, // Critical: Defaults to true to protect PII/Passwords
      maskTextClass: "vigil-mask", // Explicit override support
    });
  } catch (err) {
    if (debug) {
      console.warn(
        "Vigil SDK: rrweb failed to initialize. Proceeding in summary-only mode.",
        err,
      );
    }
  }

  // Shared flush context (referenced by both timer and final flush)
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

  // Start periodic flush
  const flushTimer = startFlushTimer(flushCtx, flushInterval);

  // Attach global error capture
  const removeErrorCapture = setupErrorCapture({
    summaryEvents,
    debug,
  });

  // Attach console.error capture
  const removeConsoleCapture = setupConsoleCapture({
    summaryEvents,
    debug,
  });

  // Attach final flush on tab close / navigation away
  const removeFinalFlush = setupFinalFlush(flushCtx, flushTimer);

  // Expose to window for debugging during early development
  if (debug) {
    (window as { __vigil?: unknown }).__vigil = {
      sessionId,
      events,
      summaryEvents,
      metadata,
      stopRecording,
      stopFlushing: flushTimer.stop,
      removeErrorCapture,
      removeConsoleCapture,
      removeFinalFlush,
    };
  }
}
