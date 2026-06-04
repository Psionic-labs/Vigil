-- Migration: 0008_add_issue_groups_fingerprint_unique.sql
-- Description: Add unique index on project_id and fingerprint for issue_groups to prevent duplicate groups under concurrent worker lease processing.

-- Deduplicate issue_groups before adding unique index
-- 1. Point issue_instances referencing duplicate groups to the primary (oldest) group
WITH duplicate_groups AS (
  SELECT id,
         MIN(id) OVER (PARTITION BY project_id, fingerprint ORDER BY created_at ASC, id ASC) as primary_id
  FROM issue_groups
)
UPDATE issue_instances
SET issue_group_id = dg.primary_id
FROM duplicate_groups dg
WHERE issue_instances.issue_group_id = dg.id AND dg.id != dg.primary_id;

-- 2. Delete duplicate groups
WITH duplicate_groups AS (
  SELECT id,
         MIN(id) OVER (PARTITION BY project_id, fingerprint ORDER BY created_at ASC, id ASC) as primary_id
  FROM issue_groups
)
DELETE FROM issue_groups
WHERE id IN (
  SELECT id FROM duplicate_groups WHERE id != primary_id
);

-- 3. Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_groups_project_fingerprint_uniq
  ON issue_groups (project_id, fingerprint);
