-- Migration: 0007_enrich_sessions_and_triage_runs.sql
-- Description: Add AI enrichment columns to sessions table, and validation/failure tracking columns to ai_triage_runs.

-- 1. Alter sessions table to add target AI-enriched columns
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS goal_completed BOOLEAN,
  ADD COLUMN IF NOT EXISTS friction_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_confidence REAL,
  ADD COLUMN IF NOT EXISTS ai_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS ai_triaged_at BIGINT;

-- 2. Alter ai_triage_runs table to add run validation details
ALTER TABLE ai_triage_runs
  ADD COLUMN IF NOT EXISTS error_type TEXT,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER,
  ADD COLUMN IF NOT EXISTS failure_stage TEXT,
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS repair_count INTEGER DEFAULT 0;
