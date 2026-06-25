# Milestone 5 — GitHub Integration (Revised)

Wire Octokit to the issue queue so Vigil can raise, track, and follow up on GitHub issues automatically from AI triage results.

> [!NOTE]
> This plan has been revised across three review rounds (R1: 12, R2: 8, R3: 8 concerns). Changes marked with 🔄 (R1), 🔄² (R2), 🔄³ (R3).

---

## User Review Required

> [!IMPORTANT]
> **GitHub App vs. OAuth App:** This plan uses a **GitHub OAuth App** for the MVP. However, we now introduce a `GitHubCredentialProvider` abstraction layer so the business logic never directly touches OAuth tokens. This means migrating to a GitHub App (installation tokens) later requires **zero rewrites** to the issue creation, label, or comment logic — only a new `GitHubAppCredentialProvider` implementation. 🔄

> [!WARNING]
> **Token Encryption:** Tokens are stored as a single JSON blob (`encrypted_token`) containing `{ ciphertext, iv, tag, version }`. The `version` field enables future key rotation without a breaking migration. Key is derived from `GITHUB_TOKEN_ENCRYPTION_KEY` env var. No fallback to `BETTER_AUTH_SECRET` — if the env var is missing, the connection endpoints return a clear 503. 🔄

> [!CAUTION]
> **GitHub API Rate Limits:** We explicitly handle `403 rate_limited`, read `x-ratelimit-remaining` and `retry-after` headers, and log them as structured telemetry. The system will **not** silently swallow rate limit errors. 🔄

## Open Questions

> [!IMPORTANT]
> **1. Replay Links:** GitHub issues are often visible to contractors, vendors, and external collaborators. Direct dashboard URLs require authentication. Options:
> - **(A)** Generate **signed, time-limited replay URLs** (e.g., HMAC-signed with 72h expiry) that bypass auth for read-only session replay.
> - **(B)** Use standard authenticated dashboard links and accept that external viewers will hit a login wall.
> - **(C)** Defer — use `VIGIL_APP_URL` env var with plain links for now, add signed URLs in Milestone 6 Polish.
>
> **This plan assumes (C)** — configurable plain links for MVP, with a `// TODO: signed replay links` marker in the template. 🔄

> [!IMPORTANT]
> **2. Auto-raise Trigger Point:** Auto-raise fires when the triage worker creates a new issue group. Should auto-raise also fire when an *existing* group's `affected_session_count` crosses a threshold (e.g., 5+ sessions)? This plan scopes auto-raise to the `create` action only, matching the roadmap spec.

---

## Key Architecture Decisions

### 🔄 No Auto-Provisioning From Better Auth

The original plan read `access_token` from the Better Auth `accounts` table and auto-provisioned `github_connections`. **This has been removed.**

Reasons:
- **Scope mismatch:** Login may only have `read:user, user:email`, not `repo`.
- **Token lifecycle ownership:** Better Auth owns `accounts.access_token`. We should not copy, cache, or depend on its refresh/rotation behavior.
- **Side-effect violation:** `GET /status` should never mutate the database.

**New approach:**
- Detect that the user has a GitHub account via `accounts` table (read-only).
- Show: *"You're signed in with GitHub. Connect a repository to enable issue integration."*
- User clicks **"Connect Repository"** → explicit OAuth flow requesting `repo` scope → stores token in our `github_connections` table.
- This is a **2-click** flow for GitHub-login users (click Connect → authorize on GitHub). Not zero-click, but correct.

### 🔄 Credential Provider Abstraction

All GitHub API interactions go through:

```typescript
interface GitHubCredentialProvider {
  getOctokit(connectionId: string): Promise<Octokit>
  validateConnection(connectionId: string): Promise<ConnectionHealth>
  revokeConnection(connectionId: string): Promise<void>
}
```

The MVP ships `OAuthCredentialProvider`. Future GitHub App support is a second implementation — no business logic rewrites needed.

### 🔄 Separate Repository Table

Instead of `UNIQUE(project_id)` on connections:

```
github_connections (1 per project)
  └── github_repositories (N per connection, UI shows 1 for MVP)
```

Schema supports multi-repo from day one. UI only exposes single-repo selection initially.

---

## Proposed Changes

### Phase 1 — Database Migration, Encryption & Abstraction Layer

Foundation: schema, token encryption, and the credential provider interface.

---

#### [NEW] [0013_github_integration.sql](file:///d:/Coding/Vigil/apps/api/migrations/0013_github_integration.sql)

```sql
-- 1. github_connections: per-project GitHub OAuth connection
CREATE TABLE github_connections (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id),
  created_by_user_id  TEXT NOT NULL REFERENCES users(id),  -- 🔄² FK for referential integrity
  github_username     TEXT NOT NULL,
  encrypted_token     TEXT NOT NULL,               -- JSON: { ciphertext, iv, tag, version }
  scopes              TEXT NOT NULL DEFAULT 'repo',
  connection_status   TEXT NOT NULL DEFAULT 'active',  -- active | expired | revoked | rate_limited | error  🔄²
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
  is_default              BOOLEAN NOT NULL DEFAULT false,  -- 🔄² target repo for issue operations
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  labels_bootstrapped     BOOLEAN NOT NULL DEFAULT false,  -- optimization hint (label creation is always idempotent)  🔄²
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL,
  UNIQUE(github_connection_id, full_name)
);

-- 3. oauth_states: nonce tracking for OAuth CSRF/replay prevention  🔄²
CREATE TABLE oauth_states (
  nonce       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,              -- created_at + 600000 (10 min)
  consumed    BOOLEAN NOT NULL DEFAULT false
);

-- 4. Add github_raise_state to issue_groups — NULL means "not requested"  🔄³
ALTER TABLE issue_groups
  ADD COLUMN github_raise_state TEXT DEFAULT NULL;
  -- Values: NULL (not requested) | raising | linked | failed
  -- Historical rows stay NULL. Only groups explicitly targeted for GitHub get a state.

-- 5. Indexes
CREATE INDEX idx_github_connections_project ON github_connections(project_id);
CREATE INDEX idx_github_repos_connection ON github_repositories(github_connection_id);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- 6. Partial unique index: only one default repo per connection  🔄³
CREATE UNIQUE INDEX idx_one_default_repo
  ON github_repositories(github_connection_id)
  WHERE is_default = true;
```

**No other changes to `issue_groups`** — columns `github_issue_url`, `github_issue_number`, `github_auto_raised`, `github_last_comment_at`, `github_last_comment_session_count` already exist from `0000_initial.sql`.

---

#### [NEW] [token-encryption.ts](file:///d:/Coding/Vigil/apps/api/src/lib/token-encryption.ts)

AES-256-GCM with versioned single-blob storage: 🔄

```typescript
interface EncryptedToken {
  ciphertext: string  // base64
  iv: string          // base64
  tag: string         // base64
  version: number     // for key rotation
}

export function encryptToken(plaintext: string): string        // returns JSON string
export function decryptToken(encryptedJson: string): string    // returns plaintext
export function getEncryptionKeyOrThrow(): Buffer              // throws if env var missing
```

- `version: 1` for initial key.
- On key rotation: increment version, re-encrypt all rows in a migration script.
- **No fallback key** — missing `GITHUB_TOKEN_ENCRYPTION_KEY` throws at startup, not silently degrades. 🔄

---

#### [NEW] [github-credential-provider.ts](file:///d:/Coding/Vigil/apps/api/src/lib/github-credential-provider.ts)

Abstraction layer for future GitHub App migration: 🔄

```typescript
export interface ConnectionHealth {
  status: 'active' | 'expired' | 'revoked' | 'rate_limited' | 'error'  // 🔄² added rate_limited
  scopes: string[]
  rateLimitRemaining: number | null
  rateLimitReset: Date | null
}

export interface GitHubCredentialProvider {
  getOctokit(connectionId: string): Promise<Octokit>
  validateConnection(connectionId: string): Promise<ConnectionHealth>
}
// Note: revokeConnection() removed — GitHub OAuth Apps don't provide
// a reliable universal revoke. Disconnect = DELETE row.  🔄²

// MVP implementation
export class OAuthCredentialProvider implements GitHubCredentialProvider { ... }
```

The `getOctokit()` method:
1. Loads `github_connections` row
2. Decrypts `encrypted_token`
3. Creates `Octokit` instance with token
4. Wraps with rate-limit-aware error handler (reads `x-ratelimit-remaining`, `retry-after`) 🔄
5. On 401 → updates `connection_status` to `expired`, sets `last_error` 🔄
6. On 403 (scope/permission) → updates `connection_status` to `revoked`, sets `last_error` 🔄
7. On 403 (rate limit) → updates `connection_status` to `rate_limited`, sets `last_error` with `retry-after` 🔄²

---

### Phase 2 — GitHub OAuth Connect/Disconnect Flow

Explicit user-initiated connection flow. No auto-provisioning. 🔄

---

#### [MODIFY] [auth.ts](file:///d:/Coding/Vigil/apps/api/src/lib/auth.ts)

**No scope change to the login provider.** 🔄

Login stays with default scopes (`read:user`, `user:email`). The `repo` scope is only requested during the explicit "Connect Repository" flow. This is cleaner — users who just want to log in don't grant repo access.

---

#### [NEW] [github.ts](file:///d:/Coding/Vigil/apps/api/src/routes/github.ts)

New Hono router mounted at `/api/v1/github` with `authMiddleware`.

**Every endpoint validates `authenticated user owns project` before proceeding.** 🔄

| Endpoint | Method | Purpose |
|---|---|---|
| `/connect` | `GET` | Generates GitHub OAuth URL with `repo` scope. Inserts nonce into `oauth_states` table. **Also cleans up expired nonces** (see below). State = signed JWT with `{ projectId, userId, nonce, exp: 10min }` 🔄 🔄³ |
| `/callback` | `GET` | Exchanges code → **atomically** consumes nonce (see below) → encrypts token → inserts `github_connections` 🔄² 🔄³ |
| `/status` | `GET` | **Read-only.** Returns connection status, repo list, and whether user has a GitHub login (for UX hint). No mutations. 🔄 |
| `/repos` | `GET` | Lists user's repos via Octokit. Updates `last_verified_at` on success, `last_error` on failure. |
| `/select-repo` | `POST` | Inserts/updates row in `github_repositories`, sets `is_default = true`. Partial unique index (`idx_one_default_repo`) guarantees exactly one default per connection. 🔄² 🔄³ |
| `/disconnect` | `POST` | Deletes `github_connections` row (cascades to `github_repositories`). No GitHub-side revocation — OAuth Apps don't reliably support it. Frontend handles missing row as "disconnected". 🔄² 🔄³ |
| `/settings` | `PUT` | Updates `projects` auto-raise/follow-up config columns. |

**OAuth State / Nonce Design:** 🔄² 🔄³
- On `/connect`:
  1. **Cleanup expired nonces** (no separate worker needed): 🔄³
     ```sql
     DELETE FROM oauth_states WHERE expires_at < EXTRACT(EPOCH FROM NOW()) * 1000 - 3600000
     ```
  2. Insert: `{ nonce, user_id, project_id, created_at, expires_at: now + 600s, consumed: false }`
  3. Sign JWT with `BETTER_AUTH_SECRET` containing `{ nonce, iat, exp: now + 600 }`
- On `/callback` — **atomic consumption** (single UPDATE, no SELECT+UPDATE race): 🔄³
  ```sql
  UPDATE oauth_states
  SET consumed = true
  WHERE nonce = $1
    AND consumed = false
    AND expires_at > EXTRACT(EPOCH FROM NOW()) * 1000
  RETURNING user_id, project_id
  ```
  If `rowCount === 0` → nonce is invalid, expired, or already consumed → return 400.
  Then verify `user_id` matches the current session.
- **Why not in-memory:** survives server restarts, works across multiple API instances, horizontally scalable 🔄²

---

#### [MODIFY] [app.ts](file:///d:/Coding/Vigil/apps/api/src/app.ts)

Add route mount:
```typescript
import { githubRouter } from "./routes/github";
app.route("/api/v1/github", githubRouter);
```

---

#### [MODIFY] [SettingsForm.tsx](file:///d:/Coding/Vigil/apps/web/components/settings/SettingsForm.tsx)

Replace hardcoded `acme/checkout-app` UI with live data:

1. **Fetch connection status** on mount via `GET /api/v1/github/status?projectId=...`
   - `connected: true` + repo selected → show connected state with repo name, status badge, disconnect button
   - `connected: true` + no repo → show repo selector dropdown
   - `connected: false` + `hasGithubLogin: true` → show *"Connect Repository"* button with hint: *"You're signed in with GitHub — connect a repo to enable issue integration"*
   - `connected: false` + `hasGithubLogin: false` → show *"Connect GitHub"* button
2. **Connection health indicator** → show `connection_status` as a badge (🟢 active, 🟡 rate_limited, 🟠 expired, 🔴 revoked/error) with `last_error` tooltip 🔄 🔄²
3. **Repo selector dropdown** → fetches from `GET /api/v1/github/repos?projectId=...`
4. **Disconnect button** → calls `POST /api/v1/github/disconnect`
5. **Auto-raise/follow-up toggles** → persist via `PUT /api/v1/github/settings`

---

### Phase 3 — Raise GitHub Issue (Manual)

The core feature with state-machine raise flow (no locks held across network calls) and idempotent label creation. 🔄 🔄²

---

#### [NEW] Service decomposition 🔄²

Instead of a single `github-issue-service.ts`, split into three focused services:

| File | Responsibility |
|---|---|
| [github-connection-service.ts](file:///d:/Coding/Vigil/apps/api/src/lib/github-connection-service.ts) | Load connection, resolve default repo, validate ownership |
| [github-repository-service.ts](file:///d:/Coding/Vigil/apps/api/src/lib/github-repository-service.ts) | Repo selection, label bootstrapping, repo metadata |
| [github-issue-service.ts](file:///d:/Coding/Vigil/apps/api/src/lib/github-issue-service.ts) | Issue creation, follow-up comments, body template rendering |

All three consume `GitHubCredentialProvider` for Octokit access.

---

#### [NEW] [github-issue-service.ts](file:///d:/Coding/Vigil/apps/api/src/lib/github-issue-service.ts)

```typescript
export type ActorContext =
  | { actorType: 'user'; userId: string }      // manual raise — validates ownership
  | { actorType: 'system' }                     // auto-raise — skips ownership check  🔄²

export async function raiseGitHubIssue(params: {
  projectId: string
  issueGroupId: string
  actor: ActorContext          // 🔄² replaces bare userId
  repositoryId?: string        // 🔄² optional — uses default repo if omitted
  manualComment?: string
  isAutoRaised?: boolean
}): Promise<{ url: string; number: number }>

export async function postFollowUpComment(params: {
  projectId: string
  issueGroupId: string
}): Promise<void>
```

**`raiseGitHubIssue` flow — state machine (no DB locks held across network):** 🔄² 🔄³

**Step 0 — Recover stale raises:** 🔄³
Before attempting a claim, clean up any stuck `raising` rows for this issue group:
```sql
UPDATE issue_groups SET
  github_raise_state = 'failed',
  updated_at = $1
WHERE id = $2
  AND github_raise_state = 'raising'
  AND updated_at < $3  -- now - 15 minutes
```
This auto-recovers from process crashes without a separate cleanup worker. The 15-minute threshold is generous enough to never race with a legitimate in-progress raise.

**Transaction 1 — Claim:**
1. **Authorization:** If `actor.actorType === 'user'` → verify `userId` owns `projectId`. If `'system'` → skip. 🔄²
2. **Atomic state transition** (NULL or `failed` → `raising`): 🔄³
   ```sql
   UPDATE issue_groups SET
     github_raise_state = 'raising',
     updated_at = $1
   WHERE id = $2
     AND project_id = $3
     AND (github_raise_state IS NULL OR github_raise_state = 'failed')
     AND github_issue_url IS NULL
   RETURNING id
   ```
3. If `rowCount === 0` → already raising, already linked, or not found → return 409
4. **COMMIT** — lock released immediately

**Network call (no transaction held):**
5. **Resolve target repo:** Load `github_repositories` where `is_default = true` for this connection (or use `repositoryId` if provided). **Note:** `connection_status` is treated as a hint — real validity comes from `getOctokit()` which handles actual token failures. 🔄² 🔄³
6. **Get Octokit:** Via `credentialProvider.getOctokit(connectionId)`
7. **Bootstrap labels (idempotent):** 🔄²
   - If `labels_bootstrapped = false` → attempt to create labels (`bug`, `vigil-detected`, `vigil-p0`–`p3`, `vigil-auto-raised`)
   - Each `createLabel()` uses try/catch: 422 (already exists) is swallowed, other errors propagate
   - Set `labels_bootstrapped = true` as an **optimization hint** — even if true, label creation still uses try/catch so it tolerates manual deletion on GitHub
8. **Build issue body** from AI report
9. **Create issue:** `octokit.rest.issues.create()`

**Transaction 2 — Commit or rollback:**
10. On success:
    ```sql
    UPDATE issue_groups SET
      github_issue_url = $1,
      github_issue_number = $2,
      github_auto_raised = $3,
      github_raise_state = 'linked',
      status = 'linked',
      updated_at = $4
    WHERE id = $5 AND github_raise_state = 'raising'
    ```
11. On failure:
    ```sql
    UPDATE issue_groups SET
      github_raise_state = 'failed',
      updated_at = $1
    WHERE id = $2 AND github_raise_state = 'raising'
    ```
    (Failed state can be retried — UI shows "Retry" button, and the claim step accepts `failed → raising`) 🔄³
12. **Update connection health:** `last_verified_at` on success, `connection_status` + `last_error` on failure

**Why this is better than FOR UPDATE:** 🔄²
- Transaction 1 is sub-millisecond (CAS on state column)
- GitHub API call holds zero DB resources
- Transaction 2 is sub-millisecond (simple UPDATE)
- Two concurrent requests: first one wins the `NULL/failed → raising` transition, second gets 409 immediately
- Process crash: `raising` with stale `updated_at` is auto-recovered to `failed` on next raise attempt (Step 0) 🔄³

**Error handling:** 🔄
- `401` → set `connection_status = 'expired'`, rollback state to `failed`, return 502
- `403 rate_limited` → set `connection_status = 'rate_limited'`, log `x-ratelimit-remaining` and `retry-after`, rollback state to `failed`, return 429 🔄²
- `403 other` → set `connection_status = 'revoked'`, rollback state to `failed`, return 502
- `422` (GitHub validation) → rollback state to `failed`, return 422 with GitHub's error message

---

#### [MODIFY] [GitHubIntegrationCard.tsx](file:///d:/Coding/Vigil/apps/web/components/issues/GitHubIntegrationCard.tsx)

Replace simulated `setTimeout` mock with real API call:

1. Accept `issueGroupId` and `projectId` as props (currently missing)
2. `handleRaiseIssue` → `POST /api/v1/github/raise` with `{ issueGroupId, projectId, comment }`
3. Handle response states:
   - Success → show linked issue with "View on GitHub" link
   - 409 → show "Already linked" badge
   - 502 (connection error) → show "GitHub connection expired" with link to Settings
   - 429 → show "Rate limited, try again in X seconds"
4. Show connection health warning if `connection_status !== 'active'`

---

#### [MODIFY] [page.tsx (issues/[id])](file:///d:/Coding/Vigil/apps/web/app/issues/%5Bid%5D/page.tsx)

Pass `issueGroupId={issue.id}` and `projectId={issue.project_id}` to `<GitHubIntegrationCard>`.

---

### Phase 4 — Auto-Raise Mode

Fire automatic GitHub issue creation when the triage worker creates a new high-severity issue group. **Auto-raise always targets the default repository** (`is_default = true`) for the project's connection. 🔄³

---

#### [MODIFY] [triage-runner.ts](file:///d:/Coding/Vigil/apps/api/src/workers/triage-runner.ts)

After a successful `createIssueGroup` with `action === "create"` (around line 419-429):

1. **After the main transaction commits** (not inside it) 🔄:
   ```typescript
   // Auto-raise check — non-blocking, outside transaction
   try {
     const project = await pool.query(
       `SELECT github_auto_raise_enabled, github_auto_raise_severity,
               github_auto_raise_min_confidence
        FROM projects WHERE id = $1`,
       [projectId]
     );
     const config = project.rows[0];
     if (!config?.github_auto_raise_enabled) return;

     const severityMeetsThreshold = /* check P0/P1 against config */;
     const confidenceMeetsThreshold = triageData.confidence >= config.github_auto_raise_min_confidence;

     if (severityMeetsThreshold && confidenceMeetsThreshold) {
       // Check connection exists and is active
       const conn = await pool.query(
         `SELECT id, connection_status FROM github_connections WHERE project_id = $1`,
         [projectId]
       );
       if (conn.rows[0]?.connection_status === 'active') {
         await raiseGitHubIssue({
           projectId,
           issueGroupId: targetGroupId,
           actor: { actorType: 'system' },  // 🔄² system actor — skips ownership check
           isAutoRaised: true,
         });
       }
     }
   } catch (err) {
     // Auto-raise failure must NEVER fail the triage job
     console.error(JSON.stringify({
       level: "error",
       action: "auto_raise_failed",
       sessionId, projectId, issueGroupId: targetGroupId,
       error: err.message,
     }));
   }
   ```

2. The `raiseGitHubIssue` state machine (`pending → raising`) is inherently race-safe — concurrent auto-raises on the same group are rejected by the CAS transition. 🔄²

---

#### [MODIFY] [SettingsForm.tsx](file:///d:/Coding/Vigil/apps/web/components/settings/SettingsForm.tsx)

Wire the existing auto-raise toggles and threshold controls to `PUT /api/v1/github/settings`:

```json
{
  "projectId": "proj_xxx",
  "autoRaiseEnabled": true,
  "autoRaiseSeverity": "P0+P1",
  "autoRaiseMinConfidence": 0.90,
  "commentEnabled": true
}
```

---

### Phase 5 — AI Follow-Up Comments

Post batched comments on existing GitHub issues when more sessions hit the same issue group.

---

#### [NEW] [github-followup-worker.ts](file:///d:/Coding/Vigil/apps/api/src/workers/github-followup-worker.ts)

**Architecture note:** 🔄 This MVP uses a polling worker. The plan notes that the correct long-term architecture is event-driven: the triage runner should enqueue a follow-up candidate when it increments `affected_session_count`. A `github_followup_queue` table (similar to `triage_jobs`) would be the right approach. For this milestone, polling is acceptable given the expected volume.

Worker runs on a configurable interval (default: every 5 minutes):

1. Query `issue_groups` WHERE:
   ```sql
   github_issue_url IS NOT NULL
   AND affected_session_count > COALESCE(github_last_comment_session_count, 0) + 5
   AND project_id IN (
     SELECT id FROM projects WHERE github_comment_enabled = true
   )
   AND project_id IN (
     SELECT project_id FROM github_connections WHERE connection_status = 'active'
   )
   ```
2. For each qualifying group:
   - Build comment body: session count delta, latest session links, friction score summary
   - `octokit.rest.issues.createComment()`
   - UPDATE `issue_groups` SET `github_last_comment_at`, `github_last_comment_session_count`
3. On token errors → update `connection_status` on `github_connections`, skip remaining groups for that project

---

## File Change Summary

| Phase | File | Action | Description |
|-------|------|--------|-------------|
| 1 | `migrations/0013_github_integration.sql` | NEW | `github_connections` + `github_repositories` + `oauth_states` tables, `github_raise_state` column |
| 1 | `src/lib/token-encryption.ts` | NEW | AES-256-GCM with versioned blob |
| 1 | `src/lib/github-credential-provider.ts` | NEW | `GitHubCredentialProvider` interface + `OAuthCredentialProvider` |
| 2 | `src/routes/github.ts` | NEW | OAuth connect/disconnect/repos/settings endpoints |
| 2 | `src/app.ts` | MODIFY | Mount `/api/v1/github` router |
| 2 | `SettingsForm.tsx` | MODIFY | Live GitHub connection UI with health indicators |
| 3 | `src/lib/github-connection-service.ts` | NEW | Connection loading, ownership validation, default repo resolution 🔄² |
| 3 | `src/lib/github-repository-service.ts` | NEW | Repo selection, idempotent label bootstrap 🔄² |
| 3 | `src/lib/github-issue-service.ts` | NEW | State-machine issue creation, follow-up comments, body template 🔄² |
| 3 | `GitHubIntegrationCard.tsx` | MODIFY | Real API calls with error state handling |
| 3 | `issues/[id]/page.tsx` | MODIFY | Pass issueGroupId/projectId props |
| 4 | `src/workers/triage-runner.ts` | MODIFY | Auto-raise hook (post-transaction, system actor, non-blocking) |
| 4 | `SettingsForm.tsx` | MODIFY | Persist auto-raise config to API |
| 5 | `src/workers/github-followup-worker.ts` | NEW | Polling worker for batched follow-up comments |

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `octokit` | `^4.x` | GitHub REST API client |
| `jsonwebtoken` | `^9.x` | Signed state JWT for OAuth flow |

No other new dependencies. `crypto` is a Node built-in.

---

## Verification Plan

### Automated Tests

```bash
# Unit: token encryption round-trip, key version handling
pnpm --filter @vigil/api test -- --grep "token-encryption"

# Unit: credential provider (mock Octokit, verify health tracking)
pnpm --filter @vigil/api test -- --grep "credential-provider"

# Unit: issue body generation, label caching logic
pnpm --filter @vigil/api test -- --grep "github-issue-service"

# Unit: state JWT signing/verification, nonce, expiry
pnpm --filter @vigil/api test -- --grep "github-oauth-state"

# E2E: raise flow with mocked Octokit (duplicate guard, race condition)
pnpm --filter @vigil/api test -- --grep "github-raise"

# Full suite regression
pnpm test:local
```

### Manual Verification

1. **Connect flow (email+password user):** Settings → Connect GitHub → OAuth → select repo → verify `github_connections` + `github_repositories` rows
2. **Connect flow (GitHub-login user):** Settings → shows "Connect Repository" hint → OAuth → select repo → verify same
3. **Raise flow:** `/issues/{id}` → type comment → Raise → verify GitHub issue with correct labels, body
4. **Duplicate guard:** Raise again on same issue → verify 409 + "Already linked" UI
5. **Race condition test:** Two concurrent raise requests → verify only one GitHub issue created
6. **Auto-raise:** Ingest session triggering P0 → verify auto-created GitHub issue with `vigil-auto-raised` label
7. **Token expiry:** Manually invalidate token → verify `connection_status` updates to `expired`, UI shows warning
8. **Follow-up comments:** Ingest 6+ sessions on same issue group → verify batched comment on GitHub issue
9. **Disconnect:** Click Disconnect → verify cleanup, auto-raise stops

---

## Review Response Matrix

### Round 1 (12 concerns)

| # | Concern | Resolution |
|---|---------|------------|
| 1 | OAuth App is wrong long-term | `GitHubCredentialProvider` abstraction. OAuth swappable for GitHub App without business logic changes. |
| 2 | Auto-provisioning from Better Auth is dangerous | **Removed.** Explicit "Connect Repository" flow for all users. `GET /status` is read-only. |
| 3 | Missing refresh token strategy | `connection_status`, `last_verified_at`, `last_error` columns. Auto-degrade on 401/403. UI shows health badge. |
| 4 | Project-level connection is limiting | Separate `github_repositories` table. Multi-repo ready, UI shows single repo for MVP. |
| 5 | Replay links need signed access | Acknowledged. MVP uses `VIGIL_APP_URL` with plain links. Signed URLs deferred to M6 with `// TODO` marker. |
| 6 | Duplicate protection has race conditions | State machine with `github_raise_state` (NULL→raising→linked/failed). Stale `raising` auto-recovered. 🔄³ |
| 7 | Label creation on every raise is wasteful | `labels_bootstrapped` as optimization hint. Label creation is always idempotent (try/catch 422). 🔄² |
| 8 | Encryption design needs improvement | Single `encrypted_token` JSON blob with `{ ciphertext, iv, tag, version }`. Rotation-ready. |
| 9 | Polling worker for follow-ups | Noted as future event-driven improvement. MVP uses polling with efficient query. |
| 10 | State JWT design | `nonce` consumed atomically via `UPDATE...WHERE consumed=false RETURNING`. 🔄³ |
| 11 | Missing ownership validation | Every endpoint validates authenticated user owns project. `ActorContext` separates user vs system. 🔄² |
| 12 | GitHub rate limits | `rate_limited` as distinct `connection_status`. Explicit `x-ratelimit-remaining`, `retry-after` handling. 🔄² |

### Round 2 (8 concerns)

| # | Concern | Resolution |
|---|---------|------------|
| R2-1 | FOR UPDATE holds lock across network | State machine: `NULL→raising` (Txn 1, commit) → GitHub call → `raising→linked` (Txn 2). Zero locks held across network. |
| R2-2 | Auto-raise ownership model is weird | `ActorContext` type: `{ actorType: 'user', userId }` or `{ actorType: 'system' }`. Authorization logic branches on actor type. |
| R2-3 | Nonce storage needs more design | `oauth_states` table with atomic `UPDATE...RETURNING` consumption. Cleanup runs during `/connect`. 🔄³ |
| R2-4 | Connection health states too coarse | Added `rate_limited` as distinct status. Affects UI messaging and retry behavior differently from `error`. |
| R2-5 | `created_by_user_id` missing FK | Added `REFERENCES users(id)` to schema. |
| R2-6 | Label bootstrap cache can drift | `labels_bootstrapped` is an optimization hint only. Label creation always uses try/catch 422 — tolerates manual deletion. |
| R2-7 | Disconnect/revoke expectations | Disconnect = `DELETE github_connections`. Row absence = disconnected. No status enum needed. 🔄³ |
| R2-8 | Multi-repo target selection | `is_default` enforced by partial unique index. Auto-raise explicitly targets default repo. 🔄³ |

### Round 3 (8 concerns)

| # | Concern | Resolution |
|---|---------|------------|
| R3-1 | `github_raise_state` should not default to `pending` | Changed to `DEFAULT NULL`. Historical rows stay NULL. Transition: `NULL/failed → raising → linked/failed`. |
| R3-2 | Crash recovery for `raising` is undefined | Step 0 in raise flow: auto-recover rows stuck in `raising` with `updated_at < now - 15min` → `failed`. No separate cleanup worker. |
| R3-3 | OAuth state consumption race | Atomic `UPDATE oauth_states SET consumed=true WHERE nonce=$1 AND consumed=false AND expires_at>now RETURNING *`. No SELECT+UPDATE. |
| R3-4 | Missing unique default repo constraint | `CREATE UNIQUE INDEX idx_one_default_repo ON github_repositories(github_connection_id) WHERE is_default = true`. |
| R3-5 | Auto-raise uses stale connection state | `connection_status` treated as hint. Real validity comes from `getOctokit()` which handles actual token failures. Documented in raise flow step 5. |
| R3-6 | OAuth states cleanup strategy | Runs during `/connect` — `DELETE WHERE expires_at < now - 1hr`. No separate background worker for this tiny table. |
| R3-7 | Disconnected status enum | Row deletion = disconnected. Frontend checks for row absence. No additional status value needed. |
| R3-8 | Multi-repo not reflected in auto-raise | Phase 4 header explicitly documents: "Auto-raise always targets the default repository". |
