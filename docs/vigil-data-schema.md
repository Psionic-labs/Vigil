# Vigil — Data Schema

> Postgres via Neon. All fields are snake_case. No ORM for now.

---

## Tables

### `users`

Basic dashboard accounts.

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  github_id   TEXT UNIQUE,
  created_at  BIGINT NOT NULL
);
```

---

### `projects`

Represents a website or app being monitored.

```sql
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
```

`public_key` is used by the SDK for ingest authentication. `github_token` must be encrypted at rest.

`github_auto_raise_severity` accepts `'P0'` or `'P0+P1'`. `github_auto_raise_min_confidence` is a float between 0 and 1 (default 0.90). Both settings are only evaluated when `github_auto_raise_enabled = true`. `github_comment_enabled` controls AI follow-up comments independently of auto-raise.

---

### `sessions`

One row per recorded browser session.

```sql
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
```

Notes:

- `sdk_version` is required because the SDK contract sends it.
- `release`, `commit_sha`, and `environment` support regression analysis and deploy correlation.
- `user_id_hash` is optional and should be hashed client-side or server-side before storage.
- `issue_instance_count` counts per-session issue evidence rows.
- `issue_group_count` counts distinct issue groups linked to the session.

---

### `events_summary`

Structured timeline events extracted from SDK summary payloads. This is what AI receives, not the raw rrweb blob.

```sql
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
```

Allowed `type` values:

- `js_error`
- `rage_click`
- `network_error`
- `dead_click`
- `navigation`
- `click`
- `console_error`

`fingerprint` is deterministic candidate evidence used for grouping. It is not treated as final truth.

---

### `issue_groups`

The main developer-facing object. One row represents a deduplicated issue that may affect many sessions.

```sql
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
```

Allowed `severity` values:

- `P0`
- `P1`
- `P2`
- `P3`

Allowed `status` values:

- `open`
- `linked`
- `ignored`
- `resolved`

`github_auto_raised` is set to `true` when the GitHub issue was created by auto-raise, not manually. `github_last_comment_at` and `github_last_comment_session_count` track when the last AI follow-up comment was posted and how many sessions were affected at that point — used to evaluate whether the batching threshold has been crossed for the next comment.

`reproduction_steps_json` stores a JSON string array for MVP simplicity.

---

### `issue_instances`

Links one session to one issue group. This preserves session-specific evidence while keeping the dashboard grouped.

```sql
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
```

This replaces the old standalone `issues` table. If the codebase prefers the existing `issues` name, use `issues` as an alias for `issue_instances`, but keep `issue_groups` as the primary product object.

---

### `ai_triage_runs`

Optional but useful for debugging model behavior.

```sql
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
```

Allowed `status` values:

- `success`
- `skipped`
- `parse_failed`
- `model_failed`
- `retry_failed`

This table is not needed for the user-facing MVP, but it is valuable during development because AI-first systems need traceability.

---

## Blob Storage Structure

Raw rrweb event blobs are stored as gzipped JSON files.

```text
/blobs/
  {project_id}/
    {session_id}/
      events.json.gz
```

`sessions.blob_path` stores the relative path.

The blob is never read by the AI. It is used by rrweb-player in the dashboard.

---

## Ingest Payload Contract

The SDK sends this to `POST /api/ingest`.

```typescript
type IngestPayload = {
  sessionId: string;
  projectKey: string;
  events: RRWebEvent[];
  summary: SummaryEvent[];
  metadata: SessionMetadata;
  isFinal: boolean;
  sdkVersion: string;
};

type SessionMetadata = {
  url: string;
  userAgent: string;
  startedAt: number;
  screenWidth: number;
  screenHeight: number;
  release?: string;
  commitSha?: string;
  environment?: "development" | "preview" | "production";
  userId?: string;
};

type SummaryEvent = {
  type:
    | "js_error"
    | "rage_click"
    | "dead_click"
    | "network_error"
    | "navigation"
    | "console_error";
  timestampMs: number;
  target?: string;
  errorMessage?: string;
  errorStack?: string;
  networkUrl?: string;
  networkStatus?: number;
  networkMethod?: string;
  clickCount?: number;
  navTo?: string;
};
```

---

## AI Triage Data Flow

1. SDK sends raw rrweb events and summary events.
2. Ingest stores raw events in blob storage.
3. Signal extractor writes normalized rows into `events_summary`.
4. Ingest computes candidate fingerprints.
5. Final session queues AI triage.
6. AI receives compact timeline plus candidate issue groups.
7. AI returns create/attach/ignore decision.
8. App writes `sessions` AI fields.
9. App writes `issue_instances`.
10. App creates or updates `issue_groups`.

---

## Key Design Decisions

### Why `issue_groups`?

Developers do not want one bug report per failed session. They want one issue representing the underlying failure, with affected session count and representative evidence.

### Why keep `issue_instances`?

Each session may contain different evidence for the same issue. Instances preserve timestamps, replay links, confidence, and session-specific details.

### Why keep session-level AI fields?

Session-level summaries, friction score, and goal completion are useful when watching an individual replay. They are not the primary triage object.

### Why send only structured summaries to AI?

It reduces token cost, avoids exposing raw replay data to the model, and makes outputs easier to audit.

### Why deterministic fingerprints if this is AI-first?

Fingerprints reduce noise and give the AI stable candidates. The AI still owns the final create/attach/ignore triage decision.

### Why no foreign key constraints yet?

Deferred for MVP speed. Enforce relationships in application logic for now and add real FK constraints in a follow-up migration. Postgres supports them fully.

### Why nanoids?

Public-facing IDs should be short, URL-safe, and non-enumerable.

---

## Indexes To Add Early

```sql
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
```

---

## AI Skip Conditions

Set `sessions.ai_analysis_skipped = true` when:

- `duration_ms < 5000`
- no rows exist in `events_summary`
- `blob_path` is null

Store the reason in `ai_skip_reason`.
