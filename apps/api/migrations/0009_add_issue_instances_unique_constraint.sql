-- Migration: 0009_add_issue_instances_unique_constraint.sql
-- Description: Add unique constraint/index on (issue_group_id, session_id) on issue_instances for idempotency.

-- Deduplicate issue_instances before adding unique index
WITH duplicate_instances AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY issue_group_id, session_id ORDER BY created_at ASC, id ASC) as rn
  FROM issue_instances
)
DELETE FROM issue_instances
WHERE id IN (
  SELECT id FROM duplicate_instances WHERE rn > 1
);

-- Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_instances_group_session_uniq
  ON issue_instances (issue_group_id, session_id);
