CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  github_id   TEXT UNIQUE,
  created_at  BIGINT NOT NULL
);

CREATE TABLE projects (
  id                               TEXT PRIMARY KEY,
  name                             TEXT NOT NULL,
  public_key                       TEXT NOT NULL UNIQUE,
  owner_id                         TEXT NOT NULL,
  github_repo                      TEXT,
  github_token                     TEXT,
  created_at                       BIGINT NOT NULL,

  github_auto_raise_enabled        BOOLEAN NOT NULL DEFAULT false,
  github_auto_raise_severity       TEXT    NOT NULL DEFAULT 'P0',
  github_auto_raise_min_confidence REAL    NOT NULL DEFAULT 0.90,
  github_comment_enabled           BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE sessions (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,

  url                   TEXT NOT NULL,
  user_agent            TEXT,
  screen_width          INTEGER,
  screen_height         INTEGER,

  release               TEXT,
  commit_sha            TEXT,
  environment           TEXT,
  user_id_hash          TEXT,
  sdk_version           TEXT,

  duration_ms           INTEGER,
  started_at            BIGINT NOT NULL,
  ended_at              BIGINT,
  created_at            BIGINT NOT NULL,

  blob_path             TEXT,

  has_js_error          BOOLEAN NOT NULL DEFAULT false,
  has_rage_click        BOOLEAN NOT NULL DEFAULT false,
  has_network_err       BOOLEAN NOT NULL DEFAULT false,
  has_dead_click        BOOLEAN NOT NULL DEFAULT false,
  error_count           INTEGER NOT NULL DEFAULT 0,

  issue_instance_count  INTEGER NOT NULL DEFAULT 0,
  issue_group_count     INTEGER NOT NULL DEFAULT 0,

  ai_analyzed_at        BIGINT,
  ai_analysis_skipped   BOOLEAN NOT NULL DEFAULT false,
  ai_skip_reason        TEXT,
  ai_session_summary    TEXT,
  ai_goal_completed     BOOLEAN,
  ai_friction_score     INTEGER,
  ai_triage_confidence  REAL
);

CREATE TABLE events_summary (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  project_id      TEXT NOT NULL,

  type            TEXT NOT NULL,
  timestamp_ms    BIGINT NOT NULL,
  target          TEXT,

  error_message   TEXT,
  error_stack     TEXT,
  network_url     TEXT,
  network_status  INTEGER,
  network_method  TEXT,
  click_count     INTEGER,
  nav_to          TEXT,

  fingerprint     TEXT,
  created_at      BIGINT NOT NULL
);

CREATE TABLE issue_groups (
  id                               TEXT PRIMARY KEY,
  project_id                       TEXT NOT NULL,

  fingerprint                      TEXT NOT NULL,
  title                            TEXT NOT NULL,
  root_cause                       TEXT,
  suggested_fix                    TEXT,
  severity                         TEXT NOT NULL,
  status                           TEXT NOT NULL DEFAULT 'open',
  confidence                       REAL,

  reproduction_steps_json          TEXT,
  evidence_summary                 TEXT,

  affected_session_count           INTEGER NOT NULL DEFAULT 0,
  first_seen_at                    BIGINT NOT NULL,
  last_seen_at                     BIGINT NOT NULL,

  github_issue_url                 TEXT,
  github_issue_number              INTEGER,
  github_auto_raised               BOOLEAN NOT NULL DEFAULT false,
  github_last_comment_at           BIGINT,
  github_last_comment_session_count INTEGER,

  created_at                       BIGINT NOT NULL,
  updated_at                       BIGINT NOT NULL
);

CREATE TABLE issue_instances (
  id                    TEXT PRIMARY KEY,
  issue_group_id        TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  project_id            TEXT NOT NULL,

  title                 TEXT NOT NULL,
  root_cause            TEXT,
  suggested_fix         TEXT,
  severity              TEXT NOT NULL,
  timestamp_ms          BIGINT,
  confidence            REAL,

  evidence_json         TEXT,
  reproduction_json     TEXT,

  dev_comment           TEXT,

  created_at            BIGINT NOT NULL
);

CREATE TABLE ai_triage_runs (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL,
  project_id            TEXT NOT NULL,

  model                 TEXT NOT NULL,
  prompt_version        TEXT NOT NULL,
  status                TEXT NOT NULL,
  input_tokens          INTEGER,
  output_tokens         INTEGER,
  error_message         TEXT,

  created_at            BIGINT NOT NULL,
  completed_at          BIGINT
);

CREATE INDEX idx_sessions_project_started
  ON sessions (project_id, started_at DESC);

CREATE INDEX idx_sessions_project_friction
  ON sessions (project_id, ai_friction_score DESC);

CREATE INDEX idx_events_summary_session_time
  ON events_summary (session_id, timestamp_ms);

CREATE INDEX idx_issue_groups_project_status
  ON issue_groups (project_id, status, last_seen_at DESC);

CREATE INDEX idx_issue_groups_project_severity
  ON issue_groups (project_id, severity, affected_session_count DESC);

CREATE INDEX idx_issue_instances_group
  ON issue_instances (issue_group_id, created_at DESC);

CREATE INDEX idx_issue_instances_session
  ON issue_instances (session_id);
