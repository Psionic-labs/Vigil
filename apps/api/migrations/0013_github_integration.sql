-- 1. github_connections: per-project GitHub OAuth connection
CREATE TABLE github_connections (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id),
  created_by_user_id  TEXT NOT NULL REFERENCES users(id),
  github_username     TEXT NOT NULL,
  encrypted_token     TEXT NOT NULL,               -- JSON: { ciphertext, iv, tag, version }
  scopes              TEXT NOT NULL DEFAULT 'repo',
  connection_status   TEXT NOT NULL DEFAULT 'active',  -- active | expired | revoked | rate_limited | error
  last_verified_at    BIGINT,                      -- last successful GitHub API call
  last_error          TEXT,                         -- last error message from GitHub API
  connected_at        BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL,
  UNIQUE(project_id)
);

-- 2. github_repositories: repos linked to a connection (supports multi-repo)
CREATE TABLE github_repositories (
  id                      TEXT PRIMARY KEY,
  github_connection_id    TEXT NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
  repo_owner              TEXT NOT NULL,            -- "Psionic-labs"
  repo_name               TEXT NOT NULL,            -- "Vigil"
  full_name               TEXT NOT NULL,            -- "Psionic-labs/Vigil"
  default_branch          TEXT DEFAULT 'main',
  is_private              BOOLEAN DEFAULT false,
  is_default              BOOLEAN NOT NULL DEFAULT false,  -- target repo for issue operations
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  labels_bootstrapped     BOOLEAN NOT NULL DEFAULT false,  -- optimization hint (label creation is always idempotent)
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL,
  UNIQUE(github_connection_id, full_name)
);

-- 3. oauth_states: nonce tracking for OAuth CSRF/replay prevention
CREATE TABLE oauth_states (
  nonce       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,              -- created_at + 600000 (10 min)
  consumed    BOOLEAN NOT NULL DEFAULT false
);

-- 4. Add github_raise_state to issue_groups — NULL means "not requested"
ALTER TABLE issue_groups
  ADD COLUMN github_raise_state TEXT DEFAULT NULL;
  -- Values: NULL (not requested) | raising | linked | failed
  -- Historical rows stay NULL. Only groups explicitly targeted for GitHub get a state.

-- 5. Indexes
CREATE INDEX idx_github_connections_project ON github_connections(project_id);
CREATE INDEX idx_github_repos_connection ON github_repositories(github_connection_id);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- 6. Partial unique index: only one default repo per connection
CREATE UNIQUE INDEX idx_one_default_repo
  ON github_repositories(github_connection_id)
  WHERE is_default = true;
