-- Migration: 0009_add_issue_instances_unique_constraint.sql
-- Description: Add unique constraint/index on (issue_group_id, session_id) on issue_instances for idempotency.

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_instances_group_session_uniq
  ON issue_instances (issue_group_id, session_id);
