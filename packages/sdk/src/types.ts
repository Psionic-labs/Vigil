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

  // Feature Toggles
  disableSessionReplay?: boolean;
  disableClickTracking?: boolean;
  disableErrorTracking?: boolean;
  disableNavigationTracking?: boolean;
}

export interface NormalizedVigilOptions extends Required<Omit<VigilOptions, "userId" | "release" | "commitSha" | "environment" | "debug" | "disableSessionReplay" | "disableClickTracking" | "disableErrorTracking" | "disableNavigationTracking">> {
  userId?: string;
  release?: string;
  commitSha?: string;
  environment?: "development" | "preview" | "production";
  debug: boolean;
  disableSessionReplay: boolean;
  disableClickTracking: boolean;
  disableErrorTracking: boolean;
  disableNavigationTracking: boolean;
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
  | "click"
  | "significant_click";

export interface SummaryEvent {
  type: SummaryEventType;
  timestampMs: number;
  target?: string | {
    tagName?: string;
    role?: string;
    id?: string;
    className?: string;
    href?: string;
  };

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
  area?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };

  // Dead click fields
  x?: number;
  y?: number;
  waitTimeMs?: number;

  // Navigation fields
  navFrom?: string;
  navTo?: string;
  navigationType?: "pushState" | "replaceState" | "popstate" | "hashchange";
}

// Global debug interface

export interface VigilDebugInterface {
  sessionId: string;
  events: unknown[];
  summaryEvents: SummaryEvent[];
  metadata: SessionMetadata | null;
  cleanup: () => void;
}

declare global {
  interface Window {
    __vigil?: VigilDebugInterface;
  }
}

