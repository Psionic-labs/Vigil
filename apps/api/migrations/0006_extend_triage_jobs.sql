-- ============================================================================
-- Migration: 0006_extend_triage_jobs.sql
-- Description: Extends the triage_jobs queue table to support state machine leasing,
--              retry telemetry, exponential backoffs, and failure visibility.
--              Also registers indices for query performance and uniqueness safety.
-- ============================================================================

-- 1. Alter Table: triage_jobs
-- Adding columns for worker lease states, retry attempts, backoff timing, and error debugging.
--  - attempts: Tracks how many times workers tried processing the job.
--  - locked_by: Tracks the unique worker identity holding the current lease.
--  - locked_at: Timestamp when the lease was claimed.
--  - failed_at: Timestamp when a retryable/dead-letter failure occurred.
--  - completed_at: Timestamp when successful triage completed.
--  - last_error: Exception message captured from the last failed attempt.
--  - next_attempt_at: Timestamp after which the job is next eligible to be processed (handles backoffs).
ALTER TABLE triage_jobs
  ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN locked_at BIGINT,
  ADD COLUMN locked_by TEXT,
  ADD COLUMN failed_at BIGINT,
  ADD COLUMN completed_at BIGINT,
  ADD COLUMN last_error TEXT,
  ADD COLUMN next_attempt_at BIGINT NOT NULL DEFAULT 0;

-- 2. Index: idx_triage_jobs_pending
-- Optimizes selection of pending or failed jobs that are ready for claiming (next_attempt_at <= now).
CREATE INDEX IF NOT EXISTS idx_triage_jobs_pending 
  ON triage_jobs (status, next_attempt_at, created_at);

-- 3. Index: idx_triage_jobs_leased
-- Optimizes identification and recovery of stale leases (leased jobs where locked_at is older than the timeout).
CREATE INDEX IF NOT EXISTS idx_triage_jobs_leased 
  ON triage_jobs (status, locked_at);

-- 4. Unique Index: idx_issue_instances_session_group_uniq
-- Guarantees a single session can only attach to any issue group once.
-- Prevents double-writes under concurrent execution or retry cycles, while still letting a session report multiple distinct issues.
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_instances_session_group_uniq 
  ON issue_instances (session_id, issue_group_id);

-- 5. Unique Index: idx_ai_triage_runs_session_uniq
-- Enforces a strict one-to-one mapping between a session and its respective successful/failed triage logging record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_triage_runs_session_uniq 
  ON ai_triage_runs (session_id);

-- 6. Index: idx_issue_groups_project_fingerprint
-- Optimizes looking up existing open candidate issue groups by project and event fingerprint, avoiding table scans.
CREATE INDEX IF NOT EXISTS idx_issue_groups_project_fingerprint 
  ON issue_groups (project_id, fingerprint);
