-- Migration: 0008_add_issue_groups_fingerprint_unique.sql
-- Description: Add unique index on project_id and fingerprint for issue_groups to prevent duplicate groups under concurrent worker lease processing.

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_groups_project_fingerprint_uniq
  ON issue_groups (project_id, fingerprint);
