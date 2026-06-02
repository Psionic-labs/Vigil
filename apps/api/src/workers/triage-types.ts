/**
 * @file triage-types.ts
 * @description Strongly-typed interfaces representing session replay telemetry events,
 *              existing issue group candidates, queue jobs, and worker contexts.
 * @why Provides compilation and type-safety guarantees across telemetry prompts formulation, LLM calls, and transactional database writes.
 */

import type { SessionTimeline } from "./triage/timeline";

/**
 * TimelineEvent
 * Represents a compressed telemetry log/interaction event captured during the session.
 * Used to construct the chronological event timeline context passed to the LLM.
 */
export interface TimelineEvent {
  type: string;             // Event type (e.g. 'error', 'navigation', 'click')
  timestamp_ms: number;     // Absolute timestamp when the event occurred in milliseconds
  target?: string | null;   // Optional DOM element target descriptive identifier
  error_message?: string | null;  // Exception error message if the event is a javascript error
  error_stack?: string | null;    // Stack trace of the javascript error
  network_url?: string | null;    // URL path of the network request
  network_status?: number | null; // HTTP response status code
  network_method?: string | null; // HTTP verb (e.g. GET, POST)
  click_count?: number | null;    // Click metrics if the event is an interaction
  nav_to?: string | null;         // Destination URL if the event is a navigation
  fingerprint?: string | null;    // Generated issue hash matching similar console/network errors
}

/**
 * CandidateIssueGroup
 * Represents an active open issue group matching the session's fingerprints.
 * Provided to the LLM to perform inline deduplication (deciding to link to an existing group vs creating a new one).
 */
export interface CandidateIssueGroup {
  id: string;            // Unique issue group identifier (e.g. 'igr_...')
  title: string;         // Summarized title of the issue group
  fingerprint: string;   // Associated issue hash
  severity: string;      // Issue priority status (e.g. P0, P1, P2, P3)
  lastSeenAt: number;    // Timestamp when this issue group was last matched to a session
}

/**
 * TriageJobRow
 * Represents a raw database row retrieved from the triage_jobs queue table.
 * Tracks leasing state, worker ownership, retry attempt metrics, and timestamps.
 */
export interface TriageJobRow {
  session_id: string;       // Session identifier corresponding to this job (acting as Primary Key)
  project_id: string;       // Scope owner project key
  status: "pending" | "leased" | "completed" | "failed" | "dead_letter"; // Current state machine state
  attempts: number;         // Count of processing attempts
  locked_at: number | null; // Timestamp when a worker leased this job
  locked_by: string | null; // Worker ID identifier representing lease ownership
  failed_at: number | null; // Timestamp when a failure occurred
  completed_at: number | null; // Timestamp when successfully finished
  last_error: string | null;   // Diagnostic exception log from the last failed attempt
  next_attempt_at: number;     // Backoff timestamp threshold after which this job can next be polled
  created_at: number;       // Timestamp when job was originally enqueued
  updated_at: number;       // Timestamp when job was last updated
}

/**
 * TriageContext
 * Aggregate structure packaging all context data required to run an AI Triage.
 * Contains session metadata, events timeline, and candidate issue groups for prompt formulation.
 */
export interface TriageContext {
  session: {
    id: string;
    url: string;
    duration_ms: number | null;
    started_at: number;
    release: string | null;
    commit_sha: string | null;
    environment: string | null;
  };
  timeline: SessionTimeline;
  candidate_issue_groups: CandidateIssueGroup[];
}
