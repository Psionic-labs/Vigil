-- Add updated_at column to track when a session was last modified by an ingest batch.
-- Essential for debugging stale sessions and future cleanup/reprocessing jobs.
ALTER TABLE sessions
  ADD COLUMN updated_at BIGINT;

-- Backfill existing rows: set updated_at = created_at for any sessions already ingested.
UPDATE sessions SET updated_at = created_at WHERE updated_at IS NULL;

-- Now enforce NOT NULL going forward.
ALTER TABLE sessions
  ALTER COLUMN updated_at SET NOT NULL;
