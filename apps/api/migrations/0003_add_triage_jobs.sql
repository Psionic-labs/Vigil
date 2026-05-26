-- Create triage_jobs table to act as an idempotent, database-backed queue for scheduling AI triage runs.
CREATE TABLE triage_jobs (
  session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Add index on status and created_at for fast worker polling
CREATE INDEX idx_triage_jobs_status_created ON triage_jobs (status, created_at);
