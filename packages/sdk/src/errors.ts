/**
 * @file errors.ts
 * @description Global JavaScript exception and unhandled promise rejection tracking.
 * Hooks into window.onerror and window.onunhandledrejection to capture runtime 
 * failures and push structured error summaries to the SDK state.
 */
import type { SummaryEvent } from "./types";

const MAX_MSG_LEN = 500;
const MAX_STACK_LEN = 2000;
const MAX_SRC_LEN = 500;
const MAX_DEDUPE = 50;

export interface ErrorCaptureContext {
  summaryEvents: SummaryEvent[];
  debug?: boolean;
}

/**
 * Initializes global JavaScript error and unhandled promise rejection listeners.
 * Emits lightweight structured events to the SDK's flush pipeline.
 *
 * @returns Cleanup function to remove event listeners.
 */
export function setupErrorCapture(ctx: ErrorCaptureContext): () => void {
  // SSR Safety: Do nothing if we are not in a browser environment
  if (typeof window === "undefined") {
    return () => {};
  }

  // Lock to prevent recursive SDK crash loops if something goes wrong inside our capture logic
  let isReporting = false;
  
  // Bounded deduplication to prevent flooding from noisy rapid-fire errors (e.g., in a requestAnimationFrame loop)
  const recentErrors = new Set<string>();

  const dedupeAndEnqueue = (
    message: string,
    stack: string | undefined,
    source: string | undefined,
    line: number | undefined,
    column: number | undefined,
    handled: boolean
  ) => {
    try {
      if (isReporting) return;
      isReporting = true;

      // Safe truncation to avoid leaking/processing massive payloads
      const safeMessage = message ? String(message).slice(0, MAX_MSG_LEN) : "Unknown error";
      const safeStack = stack ? String(stack).slice(0, MAX_STACK_LEN) : undefined;
      const safeSource = source ? String(source).slice(0, MAX_SRC_LEN) : undefined;

      // Fingerprint using message, line, and column
      const fingerprint = `${safeMessage}|${line || 0}|${column || 0}`;

      if (recentErrors.has(fingerprint)) {
        isReporting = false;
        return;
      }

      // Memory bound the dedupe cache
      if (recentErrors.size >= MAX_DEDUPE) {
        recentErrors.clear();
      }
      recentErrors.add(fingerprint);

      const timestamp = Date.now();

      const event: SummaryEvent = {
        type: "js_error",
        timestampMs: timestamp,
        timestamp,            // From the requested schema
        message: safeMessage, // From the requested schema
        errorMessage: safeMessage, // v1 contract compatibility
        stack: safeStack,     // From the requested schema
        errorStack: safeStack,// v1 contract compatibility
        source: safeSource,
        line,
        column,
        handled,
      };

      ctx.summaryEvents.push(event);

      if (ctx.debug) {
        console.log("Vigil SDK: Captured JS error", safeMessage);
      }
    } catch {
      // Defensive: never throw an error from the error handler itself
    } finally {
      isReporting = false;
    }
  };

  const onError = (event: ErrorEvent | Event) => {
    // Ignore resource loading errors (e.g., <img src="404.png">). 
    // They are Events, not ErrorEvents, and lack message/error properties.
    if (!("message" in event) && !("error" in event)) return;

    const errorEvent = event as ErrorEvent;
    let message = errorEvent.message;
    let stack: string | undefined;

    if (errorEvent.error && errorEvent.error instanceof Error) {
      if (!message) message = errorEvent.error.message;
      stack = errorEvent.error.stack;
    } else if (errorEvent.error) {
      message = String(errorEvent.error);
    }

    dedupeAndEnqueue(
      message || "Unknown ErrorEvent",
      stack,
      errorEvent.filename,
      errorEvent.lineno,
      errorEvent.colno,
      false
    );
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    let message = "Unhandled Promise Rejection";
    let stack: string | undefined;

    const reason = event.reason;
    if (reason instanceof Error) {
      message = reason.message || message;
      stack = reason.stack;
    } else if (reason !== undefined && reason !== null) {
      try {
        message = typeof reason === "string" ? reason : JSON.stringify(reason);
      } catch {
        message = String(reason);
      }
    }

    dedupeAndEnqueue(
      message,
      stack,
      undefined,
      undefined,
      undefined,
      false
    );
  };

  // We use the capture phase (true) to ensure we catch errors even if 
  // other scripts call event.stopPropagation() further down the chain.
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onUnhandledRejection, true);

  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onUnhandledRejection, true);
  };
}
