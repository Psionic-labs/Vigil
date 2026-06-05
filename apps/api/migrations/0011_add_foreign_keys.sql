-- Migration: 0011_add_foreign_keys.sql
-- Description: Add foreign key constraints on low-write/non-hot-path tables and deferred FKs for events_summary.

-- Clean up any pre-existing orphan rows to prevent migration validation failure
DELETE FROM projects WHERE owner_id NOT IN (SELECT id FROM users);
DELETE FROM issue_groups WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM issue_instances WHERE issue_group_id NOT IN (SELECT id FROM issue_groups);
DELETE FROM issue_instances WHERE session_id NOT IN (SELECT id FROM sessions);
DELETE FROM issue_instances WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM triage_jobs WHERE session_id NOT IN (SELECT id FROM sessions);
DELETE FROM triage_jobs WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM events_summary WHERE session_id NOT IN (SELECT id FROM sessions);
DELETE FROM events_summary WHERE project_id NOT IN (SELECT id FROM projects);

-- Supporting index for foreign key on events_summary(project_id) to avoid full-table scans
CREATE INDEX IF NOT EXISTS idx_events_summary_project_id ON events_summary(project_id);

-- 1. Low-write / Non-hot-path constraints:
ALTER TABLE projects 
  ADD CONSTRAINT fk_projects_owner 
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE issue_groups
  ADD CONSTRAINT fk_issue_groups_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE issue_instances
  ADD CONSTRAINT fk_issue_instances_issue_group
  FOREIGN KEY (issue_group_id) REFERENCES issue_groups(id) ON DELETE CASCADE;

ALTER TABLE issue_instances
  ADD CONSTRAINT fk_issue_instances_session
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE issue_instances
  ADD CONSTRAINT fk_issue_instances_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE triage_jobs
  ADD CONSTRAINT fk_triage_jobs_session
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE triage_jobs
  ADD CONSTRAINT fk_triage_jobs_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 2. High-write constraints (deferred to balance performance during ingestion):
ALTER TABLE events_summary
  ADD CONSTRAINT fk_events_summary_session
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE events_summary
  ADD CONSTRAINT fk_events_summary_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- 3. Documentation on sessions.project_id:
-- The foreign key from sessions.project_id to projects(id) is intentionally omitted
-- to optimize the performance of the high-throughput sessions table upserts.
