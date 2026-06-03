-- Migration: 0010_add_missing_persistence_fields.sql
-- Description: Add missing columns to issue_instances and ai_triage_runs for richer audit trails and metrics.

-- 1. Alter issue_instances to add missing persistence columns
ALTER TABLE issue_instances
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence REAL,
  ADD COLUMN IF NOT EXISTS detected_at BIGINT,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT;

-- 2. Alter ai_triage_runs to add duration and modification timestamp columns
ALTER TABLE ai_triage_runs
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT;
