ALTER TABLE sessions ADD COLUMN is_abandoned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN abandoned_at BIGINT NULL;
ALTER TABLE sessions ADD COLUMN last_ingest_at BIGINT NOT NULL DEFAULT 0;

-- Backfill last_ingest_at for existing sessions
UPDATE sessions SET last_ingest_at = created_at WHERE last_ingest_at = 0;
