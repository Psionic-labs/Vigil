/**
 * types.ts
 *
 * Shared type definitions for the Vigil SDK.
 * These mirror the frozen v1 contract from docs/vigil-sdk-contract.md.
 */

// ---------------------------------------------------------------------------
// Init options
// ---------------------------------------------------------------------------

export interface VigilOptions {
  projectKey: string;
  maskAllInputs?: boolean;
  endpoint?: string;
  flushInterval?: number;
  sessionSampleRate?: number;
  environment?: "development" | "preview" | "production";
  release?: string;
  commitSha?: string;
  userId?: string;
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Ingest payload (POST /api/ingest)
// ---------------------------------------------------------------------------

export interface IngestPayload {
  sessionId: string;
  projectKey: string;
  events: unknown[];
  summary: SummaryEvent[];
  metadata: SessionMetadata;
  isFinal: boolean;
  sdkVersion: string;
}

export interface SessionMetadata {
  url: string;
  userAgent: string;
  startedAt: number;
  screenWidth: number;
  screenHeight: number;
  environment?: "development" | "preview" | "production";
  release?: string;
  commitSha?: string;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Summary events
// ---------------------------------------------------------------------------

export type SummaryEventType =
  | "js_error"
  | "rage_click"
  | "dead_click"
  | "network_error"
  | "navigation"
  | "console_error"
  | "click";

export interface JsErrorEvent {
  type: "js_error";
  message: string;
  stack?: string;
  timestampMs: number;
}

export type ConsoleErrorEvent = {
  type: "console_error";
  message: string;
  stack?: string;
  argumentSummaries?: string[];
  timestampMs: number;
};

export type NetworkFailureEvent = {
  type: "network_failure";
  method: string;
  url: string;
  status: number;
  statusText?: string;
  durationMs?: number;
  source: "fetch" | "xhr";
  timestampMs: number;
};

export type SummaryEvent = JsErrorEvent | ConsoleErrorEvent | NetworkFailureEvent | {
  type: SummaryEventType;
  timestampMs: number;
  target?: string;

  // JS / console error fields
  errorMessage?: string; // Legacy/v1 contract fallback
  errorStack?: string; // Legacy/v1 contract fallback
  message?: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  handled?: boolean;
  timestamp?: number;
  argumentSummaries?: string[];

  // Network error fields
  networkUrl?: string;
  networkStatus?: number;
  networkMethod?: string;

  // Rage click fields
  clickCount?: number;

  // Navigation fields
  navTo?: string;
}
