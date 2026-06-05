-- Migration: 0008_add_issue_groups_fingerprint_unique.sql
-- Description: Add unique index on project_id and fingerprint for issue_groups to prevent duplicate groups under concurrent worker lease processing.

-- Deduplicate issue_groups before adding unique index
-- 1. Point issue_instances referencing duplicate groups to the primary (oldest) group
WITH ranked_groups AS (
  SELECT id, project_id, fingerprint,
         ROW_NUMBER() OVER (PARTITION BY project_id, fingerprint ORDER BY created_at ASC, id ASC) as rn
  FROM issue_groups
),
primary_groups AS (
  SELECT id as primary_id, project_id, fingerprint
  FROM ranked_groups
  WHERE rn = 1
),
duplicate_groups AS (
  SELECT rg.id, pg.primary_id
  FROM ranked_groups rg
  JOIN primary_groups pg ON rg.project_id = pg.project_id AND rg.fingerprint = pg.fingerprint
  WHERE rg.rn > 1
)
UPDATE issue_instances
SET issue_group_id = dg.primary_id
FROM duplicate_groups dg
WHERE issue_instances.issue_group_id = dg.id;

-- 2. Delete duplicate groups
WITH ranked_groups AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY project_id, fingerprint ORDER BY created_at ASC, id ASC) as rn
  FROM issue_groups
)
DELETE FROM issue_groups
WHERE id IN (
  SELECT id FROM ranked_groups WHERE rn > 1
);

-- 3. Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_groups_project_fingerprint_uniq
  ON issue_groups (project_id, fingerprint);

