-- Safe backfill for uninitialized last_ingest_at values using the highest quality timestamp fallback
UPDATE sessions
SET last_ingest_at = COALESCE(updated_at, created_at)
WHERE last_ingest_at = 0;

-- Partial index optimizing active, un-reconciled session scans
CREATE INDEX idx_sessions_reconciliation
ON sessions(last_ingest_at)
WHERE ended_at IS NULL
AND is_abandoned = false;
