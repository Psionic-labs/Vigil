/**
 * @file shared.ts
 * @description Shared utilities and context definitions for the flush module.
 * Contains critical, stack-safe buffer manipulation functions (e.g., `restoreBuffer`) 
 * to handle enormous telemetry payloads without triggering JavaScript engine limits.
 */
import type { SummaryEvent, IngestPayload, SessionMetadata } from "../types";
import { sanitizeUrl } from "../utils";

// Shared context

/** Context that `init()` passes in so flush knows what to send. */
export interface FlushContext {
  sessionId: string;
  projectKey: string;
  endpoint: string;
  sdkVersion: string;
  events: unknown[];
  summaryEvents: SummaryEvent[];
  metadata: SessionMetadata;
  debug: boolean;
}

export interface FlushTimer {
  stop: () => void;
  getInFlight: () => { events: unknown[]; summary: SummaryEvent[] } | null;
}

const scheduledFlushCleanups = new Set<() => void>();

export function registerScheduledFlushCleanup(cleanup: () => void): void {
  scheduledFlushCleanups.add(cleanup);
}

export function unregisterScheduledFlushCleanup(cleanup: () => void): void {
  scheduledFlushCleanups.delete(cleanup);
}

/** Cancel registered interval/debounce/retry scheduling before terminal dispatch. */
export function cancelAllScheduledFlushes(): void {
  for (const cleanup of [...scheduledFlushCleanups]) {
    cleanup();
  }
  scheduledFlushCleanups.clear();
}

// Shared helpers

/**
 * O(N) stack-safe array restore. Prevents "Maximum call stack size exceeded"
 * on massive telemetry arrays and avoids O(N^2) unshift loop freezes.
 *
 * It puts `items` at the beginning of `buffer`.
 */
export function restoreBuffer<T>(buffer: T[], items: T[]): void {
  const original = [...buffer];
  buffer.length = 0;
  // Combine items (new batch) + original (old buffer)
  for (const item of items) buffer.push(item);
  for (const item of original) buffer.push(item);
}

/**
 * Drain an array in-place and return the removed items.
 * This is the atomic "take all and clear" primitive for both buffers.
 */
export function drain<T>(buffer: T[]): T[] {
  return buffer.splice(0, buffer.length);
}

/**
 * Build an `IngestPayload` by draining both buffers.
 * Returns `null` if both buffers are empty (nothing to send).
 */
export function buildPayload(
  ctx: FlushContext,
  isFinal: boolean,
): {
  payload: IngestPayload;
  events: unknown[];
  summary: SummaryEvent[];
} | null {
  if (typeof window !== "undefined" && window.location) {
    // Keep metadata URL fresh for SPAs (strips query/hash params for privacy)
    ctx.metadata.url = sanitizeUrl(window.location.href);
  }

  const events = drain(ctx.events);
  const summary = drain(ctx.summaryEvents);

  if (events.length === 0 && summary.length === 0 && !isFinal) {
    return null;
  }

  const payload: IngestPayload = {
    sessionId: ctx.sessionId,
    projectKey: ctx.projectKey,
    events,
    summary,
    metadata: ctx.metadata,
    isFinal,
    sdkVersion: ctx.sdkVersion,
  };

  return { payload, events, summary };
}

/**
 * Build an `IngestPayload` without draining the buffers.
 * Used for non-destructive intermediate flushes (like visibilitychange)
 * where we want to opportunistically persist data without closing the session.
 */
export function buildSnapshotPayload(
  ctx: FlushContext,
): {
  payload: IngestPayload;
  events: unknown[];
  summary: SummaryEvent[];
} | null {
  if (typeof window !== "undefined" && window.location) {
    // Keep metadata URL fresh for SPAs (strips query/hash params for privacy)
    ctx.metadata.url = sanitizeUrl(window.location.href);
  }

  const events = [...ctx.events];
  const summary = [...ctx.summaryEvents];

  if (events.length === 0 && summary.length === 0) {
    return null;
  }

  const payload: IngestPayload = {
    sessionId: ctx.sessionId,
    projectKey: ctx.projectKey,
    events,
    summary,
    // Shallow copy metadata to prevent shared reference mutations
    metadata: { ...ctx.metadata },
    isFinal: false,
    sdkVersion: ctx.sdkVersion,
  };

  return { payload, events, summary };
}
