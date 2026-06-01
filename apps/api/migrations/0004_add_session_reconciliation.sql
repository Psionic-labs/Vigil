-- Migration: 0004_add_session_reconciliation.sql
-- Description: Adds column flags to track idle and abandoned sessions.
--              Used by the background reconciliation worker daemon to identify
--              and close sessions that have ceased sending packets.

-- Add is_abandoned flag: mark if session timed out and was closed by the system.
ALTER TABLE sessions ADD COLUMN is_abandoned BOOLEAN NOT NULL DEFAULT false;

-- Add abandoned_at timestamp: record when the reconciliation worker marked it closed.
ALTER TABLE sessions ADD COLUMN abandoned_at BIGINT NULL;

-- Add last_ingest_at timestamp: tracks when the last packet was ingested for the session,
-- used to calculate the idle duration elapsed since the last packet (now - last_ingest_at).
ALTER TABLE sessions ADD COLUMN last_ingest_at BIGINT NOT NULL DEFAULT 0;

-- Backfill last_ingest_at for existing sessions with their original creation timestamp.
UPDATE sessions SET last_ingest_at = created_at WHERE last_ingest_at = 0;
