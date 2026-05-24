-- Add is_active flag to projects table to support disabling ingestion
-- without deleting project records.
ALTER TABLE projects
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Explicit index for the ingest lookup query:
--   SELECT id FROM projects WHERE public_key = $1 AND is_active = true
-- The existing UNIQUE constraint on public_key already provides a B-tree index,
-- but the ingest hot-path filters on (public_key, is_active) together.
-- This partial index covers only active projects, keeping the index small.
CREATE INDEX idx_projects_public_key_active
  ON projects (public_key)
  WHERE is_active = true;
