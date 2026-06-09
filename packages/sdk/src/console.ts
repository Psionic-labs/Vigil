/**
 * @file console.ts
 * @description Overrides standard console endpoints to log and capture warn/error calls.
 * @why Automates log capturing without requiring manual event tracking code changes.
 */

import type { SummaryEvent } from "./types";

const MAX_MSG_LEN = 500;
const MAX_STACK_LEN = 2000;
const MAX_ARG_LEN = 200;
const MAX_DEDUPE = 50;

export interface ConsoleCaptureContext {
  summaryEvents: SummaryEvent[];
  debug?: boolean;
}

/**
 * Safely monkey patches console.error to capture error logs.
 * Emits lightweight structured events to the SDK's flush pipeline.
 *
 * @returns Cleanup function to restore original console.error.
 */
export function setupConsoleCapture(ctx: ConsoleCaptureContext): () => void {
  // SSR Safety: Do nothing if we are not in a browser environment or console is missing
  if (
    typeof window === "undefined" ||
    typeof console === "undefined" ||
    !console.error
  ) {
    return () => {};
  }

  // Prevent double patching if initialized multiple times
  if ((console.error as any).__vigil_patched) {
    return () => {};
  }

  const originalConsoleError = console.error;
  let isReporting = false; // Prevents recursive loops if SDK throws inside the patch
  const recentErrors = new Set<string>();

  const safeStringify = (arg: unknown): string => {
    if (arg === undefined) return "undefined";
    if (arg === null) return "null";
    if (arg instanceof Error) return arg.stack || arg.message || String(arg);
    if (typeof arg === "string") return arg;
    if (typeof arg === "function" || typeof arg === "symbol")
      return String(arg);
    try {
      const result = JSON.stringify(arg);
      // JSON.stringify can return undefined for certain cases (e.g., toJSON returning undefined)
      if (result === undefined) return "undefined";
      return result;
    } catch {
      return String(arg); // Fallback for circular references or bigints
    }
  };

  const patchedConsoleError = function (this: any, ...args: unknown[]) {
    // 1. ALWAYS execute the original immediately to preserve host app behavior
    const result = originalConsoleError.apply(console, args);

    // 2. Safely capture the event for Vigil
    try {
      if (isReporting) return result;
      isReporting = true;

      let message = "";
      let stack: string | undefined;

      // Extract a summary of all arguments
      const argSummaries = args.map((arg) =>
        safeStringify(arg).slice(0, MAX_ARG_LEN),
      );

      // Attempt to extract an authentic error stack if an Error was passed
      const errorArg = args.find((a): a is Error => a instanceof Error);
      if (errorArg) {
        message = errorArg.message;
        stack = errorArg.stack;
      } else {
        message = argSummaries.join(" ");
        // Generate a synthetic stack trace if no Error was provided
        try {
          throw new Error("Synthetic Console Error Stack");
        } catch (e) {
          const rawStack = (e as Error).stack;
          if (rawStack) {
            // Split into lines to remove the SDK's own frame to avoid confusing devs
            const lines = rawStack.split("\n");
            stack = [lines[0], ...lines.slice(2)].join("\n");
          }
        }
      }

      // Safe truncation to avoid payload bloat
      const safeMessage = message.slice(0, MAX_MSG_LEN);
      const safeStack = stack ? stack.slice(0, MAX_STACK_LEN) : undefined;

      // Deduplication fingerprint based on message AND argument signatures
      const fingerprint = `${safeMessage}|${argSummaries.join("|")}`;

      if (recentErrors.has(fingerprint)) {
        return result; // Skip enqueueing duplicate
      }

      if (recentErrors.size >= MAX_DEDUPE) {
        recentErrors.clear(); // Bounded memory
      }
      recentErrors.add(fingerprint);

      const timestamp = Date.now();

      const event: SummaryEvent = {
        type: "console_error",
        timestampMs: timestamp,
        timestamp, // schema requirement
        message: safeMessage, // schema requirement
        errorMessage: safeMessage, // legacy v1 contract
        stack: safeStack, // schema requirement
        errorStack: safeStack, // legacy v1 contract
        argumentSummaries: argSummaries, // schema requirement
      };

      ctx.summaryEvents.push(event);
    } catch {
      // Defensive: never throw from the SDK
    } finally {
      isReporting = false;
    }

    return result;
  };

  // Apply patch
  console.error = patchedConsoleError;
  (patchedConsoleError as any).__vigil_patched = true;
  (window as any).__vigil_console_captured = true;

  // Return teardown function
  return () => {
    // Only restore if we haven't been wrapped by another APM
    if (console.error === patchedConsoleError) {
      console.error = originalConsoleError;
    }
    // Remove our signature so we can be cleanly re-initialized later
    delete (patchedConsoleError as any).__vigil_patched;
    delete (window as any).__vigil_console_captured;
  };
}
