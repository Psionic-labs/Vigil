# Vigil — Production Readiness Review

**Reviewer:** Principal/Staff Software Engineer  
**Date:** 2026-05-30  
**Scope:** Full codebase — SDK, API, Database, Web Dashboard, AI Pipeline, Infrastructure  
**Verdict:** **Not production-ready.** Significant work required before beta.

---

## 1. Executive Summary

Vigil is an early-stage session replay and AI triage platform with a sound architectural vision and reasonably clean code for its maturity. The SDK is well-structured with proper lifecycle management. The ingest pipeline has transactional correctness. Fingerprinting is thoughtful.

**However, the system has fundamental gaps that will cause real failures under production load:**

- **No authentication or authorization** on the dashboard API — anyone with the URL can read all customer data - plug in [better-auth](https://better-auth.com/)
- **No rate limiting** on the ingest endpoint — a single malicious actor can exhaust the database
- **No foreign key constraints** anywhere in the schema — data integrity is best-effort
- **Local disk blob storage** with no backup, retention, or replication — replay data will be lost
- **In-process reconciliation worker** that creates single-point-of-failure coupling
- **No connection pool configuration** — Neon serverless has strict connection limits
- **The web dashboard is entirely mock data** — zero integration with the actual database
- **No CI/CD pipeline** — no automated tests, builds, or deployments
- **No AI triage worker implementation** — the queue exists but nothing consumes it
- **Unbounded `events` payload** accepts `z.array(z.unknown())` — the server will deserialize arbitrary JSON

The system is roughly 40% of the way to a beta-ready state.

---

## 2. Critical Findings

### C-1: No Authentication or Authorization on Dashboard/API

**File:** [app.ts](file:///d:/Coding/Vigil/apps/api/src/app.ts)  
**File:** [web/app](file:///d:/Coding/Vigil/apps/web/app)

**Problem:** The ingest endpoint authenticates via `projectKey`, but there is zero authentication on the health endpoint, and the architecture doc mentions auth (Clerk/NextAuth) as a future item. More critically, the web dashboard has no API layer at all — it renders mock data. When a real API is added, there is no auth middleware, no session management, no RBAC.

**Failure mode:** Any user who discovers the dashboard URL can view all projects, sessions, issues, and replay data for all customers. This is a data breach waiting to happen.

**When it hurts:** Day one with real customers.

**Tradeoff:** Deferring auth to focus on core pipeline. Understandable for prototyping but unacceptable for beta.

**Severity:** 🔴 **Critical**

**Remediation:** 
1. Plug in [better-auth](https://better-auth.com/)
2. Add auth middleware to all dashboard API routes
3. Implement project-scoped access control (user → project membership)
4. Add `project_id` scoping to every query

**Complexity:** Medium  
**Timeline:** Immediately

---

### C-2: No Rate Limiting on Ingest Endpoint

**File:** [ingest.ts](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts)

**Problem:** The ingest endpoint has a 2MB body limit but no per-IP, per-project, or per-session rate limiting. A single client (or attacker with a valid `projectKey`) can flood the endpoint with legitimate-looking payloads.

**Failure mode:** 
- A misbehaving SDK installation in a high-traffic SPA (e.g., a React app with a rendering loop triggering errors) will send thousands of payloads per minute
- A malicious actor who obtains any `projectKey` (it's a public key, visible in client-side JS) can POST unlimited payloads
- Each payload triggers a database transaction with multiple queries, exhausting the Neon connection pool

**When it hurts:** 100 users. Possibly sooner with a single abusive client.

**Tradeoff:** Simplicity of MVP ingest path.

**Severity:** 🔴 **Critical**

**Remediation:**
1. Add per-IP rate limiting (e.g., `hono-rate-limiter` or custom middleware with Redis/in-memory)
2. Add per-project rate limiting (requests per minute per `projectKey`)
3. Add per-session rate limiting (max flushes per session per minute)
4. Consider a burst allowance pattern (token bucket)
5. Return `429 Too Many Requests` with `Retry-After` header

**Complexity:** Medium  
**Timeline:** Immediately

---

### C-3: No Foreign Key Constraints in Database Schema

**File:** [0000_initial.sql](file:///d:/Coding/Vigil/apps/api/migrations/0000_initial.sql)

**Problem:** Not a single `REFERENCES` or `FOREIGN KEY` constraint exists across all tables. `sessions.project_id` doesn't reference `projects.id`. `events_summary.session_id` doesn't reference `sessions.id`. `issue_instances.issue_group_id` doesn't reference `issue_groups.id`. `triage_jobs.session_id` doesn't reference `sessions.id`.

**Failure mode:**
- Orphaned `events_summary` rows when sessions are deleted
- `issue_instances` pointing to nonexistent `issue_groups`
- Cascading data inconsistency during manual cleanup operations
- Impossible to trust relational queries without defensive `LEFT JOIN` everywhere
- Any future data retention/cleanup logic has no referential safety net

**When it hurts:** First data migration. First manual cleanup. First bug in the triage worker.

**Tradeoff:** Avoiding FK overhead during high-throughput ingest. This is a legitimate concern for ingest-heavy tables but not for `issue_groups` → `issue_instances` or `users` → `projects`.

**Severity:** 🔴 **Critical**

**Remediation:**
1. Add FK constraints on low-write tables immediately: `projects.owner_id → users.id`, `issue_instances.issue_group_id → issue_groups.id`, `triage_jobs.session_id → sessions.id`
2. For high-write tables (`events_summary.session_id → sessions.id`), add deferred FK constraints or implement application-level consistency checks
3. Document the intentional FK omission on `sessions.project_id` if it's a performance decision

**Complexity:** Small  
**Timeline:** Before beta

---

### C-4: `events` Array Accepts Arbitrary Unknown JSON

**File:** [ingest-schema.ts](file:///d:/Coding/Vigil/apps/api/src/validation/ingest-schema.ts#L77)

**Problem:** `events: z.array(z.unknown()).max(500)` — the server accepts up to 500 elements of completely arbitrary JSON, each of which can be a deeply nested object of unlimited size. The 2MB body limit provides some protection, but within that limit, a single event can be an extremely complex object that causes:
- OOM during `JSON.stringify()` in the blob persistence path
- CPU exhaustion during gzip compression
- Disk exhaustion from large blob files

**Failure mode:** A crafted payload with 500 events, each containing a 3KB deeply nested object, totals ~1.5MB. After JSON serialization, this expands. The `setImmediate` blob persistence will serialize this in the main event loop, blocking all other requests for potentially hundreds of milliseconds.

**When it hurts:** Any hostile or buggy SDK sends oversized events.

**Severity:** 🔴 **Critical**

**Remediation:**
1. Add a max depth or max size constraint on individual events
2. Consider validating that events match the rrweb event shape (at least `type` and `timestamp` fields)
3. Add a per-event size limit (e.g., stringify and check byte length before accepting)
4. Move blob serialization to a worker thread to avoid blocking the event loop

**Complexity:** Medium  
**Timeline:** Before beta

---

## 3. High Priority Findings

### H-1: Local Disk Blob Storage with No Backup, Retention, or Multi-Instance Support

**File:** [blob-storage.ts](file:///d:/Coding/Vigil/apps/api/src/lib/blob-storage.ts)

**Problem:** Replay blobs are stored on the local filesystem relative to the API process. This means:
- No replication — disk failure = permanent data loss
- No retention policy — storage grows unbounded
- No multi-instance deployment — second API instance writes to a different disk
- No cleanup — orphaned blobs from failed sessions are never deleted
- The `blob_path` stored in the session row is a local path, not a URL

**Failure mode:** Deploy two API instances behind a load balancer → replays are split across instances → replay viewer gets 404s for half the sessions. Disk fills up → all ingestion fails.

**When it hurts:** First production deployment, first disk full incident.

**Tradeoff:** Avoiding S3/R2 complexity in MVP.

**Severity:** 🟠 **High**

**Remediation:**
1. Migrate to S3/R2/GCS with signed URLs for replay retrieval
2. Implement a retention policy (e.g., 30-day TTL, extended for sessions linked to issue groups)
3. Store a URL/key in `blob_path`, not a filesystem path
4. Add a cleanup worker for orphaned blobs

**Complexity:** Large  
**Timeline:** Before first paying customer

---

### H-2: In-Process Reconciliation Worker Creates Deployment Coupling

**File:** [reconciliation.ts](file:///d:/Coding/Vigil/apps/api/src/lib/reconciliation.ts)  
**File:** [index.ts](file:///d:/Coding/Vigil/apps/api/src/index.ts)

**Problem:** The reconciliation worker runs inside the same Node.js process as the API server via `setInterval`. This means:
- Deploying 2+ API instances runs 2+ reconciliation workers concurrently on the same data with no coordination
- A long-running reconciliation query blocks the event loop and degrades ingest latency
- Worker failures are invisible (caught and logged, but no alerting)
- The `isReconciling` lock is process-local, not distributed

**Failure mode:** Two instances both run `UPDATE sessions SET is_abandoned = true` simultaneously. While PostgreSQL handles this safely at the row level, the stats query (`COUNT(*)`) returns stale data, and the log output from both workers is misleading. At scale, the `UPDATE ... RETURNING 1` scan becomes expensive and holds row locks for increasing durations.

**When it hurts:** First horizontal scale attempt. First slow query incident.

**Tradeoff:** Avoiding a separate worker process or job queue.

**Severity:** 🟠 **High**

**Remediation:**
1. Use `pg_advisory_lock` to ensure only one worker runs at a time across instances
2. Add a `LIMIT` clause to the reconciliation query to avoid full-table scans
3. Long-term: extract to a separate worker process (cron job, or BullMQ consumer)
4. Add metrics emission (reconciled count, scan duration, scan errors)

**Complexity:** Medium  
**Timeline:** Before beta

---

### H-3: No Connection Pool Configuration on Neon Serverless

**File:** [db.ts](file:///d:/Coding/Vigil/apps/api/src/db.ts#L21)

**Problem:** `new Pool({ connectionString: databaseUrl || "postgres://fake" })` — no `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, or statement timeout configuration. Neon's serverless connection limits are strict (often 100 concurrent connections on free/starter tiers). The default `pg` pool size is 10, which is fine for a single instance, but:
- Each ingest request acquires a transaction connection
- The project validation query acquires a separate connection from the pool
- The async `blob_path` update acquires yet another connection
- Under load, 10 concurrent requests consume the entire pool

**Failure mode:** At ~50-100 concurrent ingest requests, the pool exhausts. New requests queue indefinitely. The reconciliation worker's queries also compete for pool connections. Result: cascading timeouts and 500s.

**When it hurts:** 100-500 concurrent users with the SDK installed.

**Severity:** 🟠 **High**

**Remediation:**
1. Configure explicit pool settings: `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`
2. Add a statement timeout: `statement_timeout: '10s'`
3. Move the project validation query inside the transaction to use the same connection
4. Monitor pool utilization metrics

**Complexity:** Small  
**Timeline:** Immediately

---

### H-4: Async Blob Persistence Can Silently Lose Replay Data

**File:** [ingest.ts](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts#L334-L369)

**Problem:** After the DB transaction commits and the HTTP 200 is returned to the client, the replay blob is persisted via `setImmediate` → `persistReplayBlob`. If the process crashes, restarts, or the disk write fails, the replay data is permanently lost. The SDK has already drained its buffer. There is no retry mechanism, no dead-letter queue, and no reconciliation.

**Failure mode:** The API returns success, the SDK clears its buffer, and then the process crashes during blob compression. The session row exists in the DB with `blob_path = NULL`. The user's replay is gone forever.

**When it hurts:** First deployment restart during ingest traffic. First disk I/O error.

**Tradeoff:** Moving blob persistence off the critical path for latency. Correct tradeoff, wrong implementation.

**Severity:** 🟠 **High**

**Remediation:**
1. Add a `replay_pending` flag to the session row, set in the transaction
2. Add a background worker that retries blob persistence for sessions with `replay_pending = true AND blob_path IS NULL`
3. Alternatively, persist blob data to a durable queue (Redis stream, SQS) before returning 200
4. Add metrics for blob persistence failures

**Complexity:** Medium  
**Timeline:** Before first paying customer

---

### H-5: No Multi-Tenant Data Isolation

**File:** [0000_initial.sql](file:///d:/Coding/Vigil/apps/api/migrations/0000_initial.sql)

**Problem:** All projects share the same tables with no Row-Level Security (RLS), no tenant isolation, and no `project_id` partitioning. Every query must include a `WHERE project_id = $1` clause, and there's no enforcement if one is forgotten.

**Failure mode:** A dashboard bug or API oversight omits `project_id` in a query → one customer sees another customer's sessions, issues, and replay data. This is a data leak, not just a bug.

**When it hurts:** First multi-customer deployment. First query without a `project_id` filter.

**Severity:** 🟠 **High**

**Remediation:**
1. Enable RLS on all tenant-scoped tables
2. Create RLS policies that filter by `project_id` using a session variable
3. Set `current_setting('app.project_id')` at the start of each transaction
4. As a lighter alternative: add a database middleware that injects `project_id` into all queries and add a code review checklist item

**Complexity:** Medium  
**Timeline:** Before first paying customer

---

### H-6: Dashboard is Entirely Mock Data — Zero Backend Integration

**File:** [page.tsx](file:///d:/Coding/Vigil/apps/web/app/page.tsx#L6)  
**File:** [mock-data.ts](file:///d:/Coding/Vigil/apps/web/lib/mock-data.ts)

**Problem:** The entire web dashboard renders from `MOCK_ISSUES` and `MOCK_SESSIONS` hardcoded arrays. There are no API routes, no database queries, no SSR data fetching. The dashboard is a static design prototype, not a functional application.

**Failure mode:** The dashboard cannot display real data. There is no way to view actual sessions, issues, or replay recordings. The product is non-functional.

**When it hurts:** Today. Customers cannot use the product.

**Severity:** 🟠 **High**

**Remediation:**
1. Build Next.js API routes or Server Actions for session/issue queries
2. Connect to the same Neon database
3. Implement pagination, filtering, and sorting
4. Add replay viewer integration (load blobs and render with rrweb-player)

**Complexity:** Large  
**Timeline:** Before beta

---

### H-7: No CI/CD Pipeline

**File:** [.github/](file:///d:/Coding/Vigil/.github)

**Problem:** The `.github/` directory contains only `dependabot.yml`. There are no GitHub Actions workflows for:
- Running tests (`vitest run`)
- Type checking (`tsc --noEmit`)
- Linting (`eslint`)
- Building packages
- Deploying to staging/production

**Failure mode:** Regressions are introduced silently. PRs merge without test validation. Deployments are manual and error-prone.

**When it hurts:** Second engineer joins the team. First regression in a PR.

**Severity:** 🟠 **High**

**Remediation:**
1. Add a CI workflow: lint → typecheck → test → build
2. Add branch protection rules requiring CI pass
3. Add a CD workflow for staging/production deployment
4. Add SDK bundle size tracking

**Complexity:** Small  
**Timeline:** Immediately

---

### H-8: No AI Triage Worker Implementation

**File:** [0003_add_triage_jobs.sql](file:///d:/Coding/Vigil/apps/api/migrations/0003_add_triage_jobs.sql)

**Problem:** The `triage_jobs` table is created and jobs are enqueued during session finalization, but there is no worker that consumes these jobs. No AI triage runs exist. The core value proposition of the product (AI-powered bug triage) is completely unimplemented.

**Failure mode:** `triage_jobs` grows unboundedly. No sessions receive AI analysis. Issue groups are never created. The product cannot deliver its primary feature.

**When it hurts:** Today.

**Severity:** 🟠 **High**

**Remediation:**
1. Implement a triage worker (poll `triage_jobs WHERE status = 'pending'` with `FOR UPDATE SKIP LOCKED`)
2. Build the AI prompt assembly pipeline (compact timeline + candidate groups)
3. Parse and validate AI output, write to `issue_groups` and `issue_instances`
4. Add `ai_triage_runs` logging for cost tracking and observability
5. Add error handling, retries, and dead-letter semantics

**Complexity:** Large  
**Timeline:** Before beta

---

## 4. Medium Priority Findings

### M-1: `sessionId` is Client-Generated and Untrusted

**File:** [session.ts](file:///d:/Coding/Vigil/packages/sdk/src/session.ts)  
**File:** [ingest.ts](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts)

**Problem:** The `sessionId` is a client-generated UUID stored in `sessionStorage`. It is used as the primary key of the `sessions` table. A malicious client can:
- Send a `sessionId` that collides with another project's session (since `sessionId` is globally unique across all projects, but there's no composite PK)
- Overwrite another project's session data via the upsert
- Enumerate session IDs and inject data

**Failure mode:** Attacker sends `sessionId: "target-session-id"` with their own `projectKey` → the upsert's `ON CONFLICT (id)` fires → the session's `project_id` doesn't change (not in the UPDATE SET), but flags, timestamps, and error counts are corrupted.

**When it hurts:** First adversarial user. First accidental session ID collision.

**Severity:** 🟡 **Medium**

**Remediation:**
1. Make the session primary key composite: `(project_id, session_id)` or prefix session IDs with project ID
2. Add a WHERE clause to the upsert: `ON CONFLICT (id) DO UPDATE ... WHERE sessions.project_id = EXCLUDED.project_id`
3. Validate session ID format server-side (UUID pattern check)

**Complexity:** Medium  
**Timeline:** Before beta

---

### M-2: Database Migration Script Has No Transaction Safety

**File:** [migrate.ts](file:///d:/Coding/Vigil/apps/api/scripts/migrate.ts#L62-L73)

**Problem:** Each migration file is executed with `pool.query(sql)` and then recorded in `_migrations`, but this is not wrapped in a transaction. If a migration file contains multiple statements and one fails partway through, the database is left in a partially migrated state, but the migration is not recorded as applied.

**Failure mode:** Migration `0004` adds a column and an index. The column add succeeds, the index creation fails (e.g., OOM or lock timeout). The migration is not recorded. Running migrate again tries to add the column again → error. Manual intervention required.

**When it hurts:** First complex migration on a production database with data.

**Severity:** 🟡 **Medium**

**Remediation:**
1. Wrap each migration in a transaction: `BEGIN` → execute SQL → `INSERT INTO _migrations` → `COMMIT`
2. Add a `down` migration mechanism for rollbacks
3. Consider using a proper migration tool (e.g., `node-pg-migrate`, `drizzle-kit`)

**Complexity:** Small  
**Timeline:** Before beta

---

### M-3: `events_summary` Table Has No Partition Strategy and Will Grow Unbounded

**File:** [0000_initial.sql](file:///d:/Coding/Vigil/apps/api/migrations/0000_initial.sql#L64-L83)

**Problem:** `events_summary` receives every JS error, click, navigation, and network error from every session. At scale:
- 10,000 sessions/day × ~20 events/session = 200,000 rows/day = 73M rows/year
- No partition key, no time-based partitioning, no retention policy
- The only index is `(session_id, timestamp_ms)` — queries by `project_id` require a full scan on that dimension

**Failure mode:** At 50M rows, queries like "show me all JS errors for this project in the last 7 days" become slow. Vacuum operations become expensive. Storage costs grow linearly with no ceiling.

**When it hurts:** 6-12 months of production usage.

**Severity:** 🟡 **Medium**

**Remediation:**
1. Add time-based partitioning on `created_at` (monthly or weekly)
2. Add an index on `(project_id, type, created_at)` for project-scoped queries
3. Implement a data retention policy (e.g., 90 days, with archive to cold storage)
4. Add a `project_id` filter to the existing session index

**Complexity:** Medium  
**Timeline:** Before scale

---

### M-4: Replay Blob Persistence Creates Duplicate Blobs with No Deduplication

**File:** [blob-storage.ts](file:///d:/Coding/Vigil/apps/api/src/lib/blob-storage.ts)  
**File:** [ingest.ts](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts#L334-L369)

**Problem:** Every ingest call with `events.length > 0` creates a new blob file with a unique timestamp+random suffix. If the SDK retries a flush (e.g., network failure followed by success), identical events are persisted twice. The `blob_path` field in `sessions` is overwritten to the latest blob, orphaning earlier blobs.

**Failure mode:** 
- Storage doubles under retry conditions
- Orphaned blobs are never cleaned up
- The replay viewer shows only the last blob chunk, missing earlier chunks

**When it hurts:** SDK retries + long sessions with multiple flushes.

**Severity:** 🟡 **Medium**

**Remediation:**
1. Add a blob manifest table tracking all chunks per session
2. Implement deduplication by content hash
3. Build a blob garbage collector for orphaned files
4. Design a replay stitching layer that assembles all chunks for playback

**Complexity:** Medium  
**Timeline:** Before first paying customer

---

### M-5: `blob_path` Update Happens Outside Transaction

**File:** [ingest.ts](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts#L349-L364)

**Problem:** The `pool.query` that updates `session.blob_path` runs after the transaction commits, outside the response path, with a fire-and-forget `.catch()`. If this query fails:
- The session row has `blob_path = NULL` even though the blob file exists on disk
- The replay viewer can't find the blob
- There's no retry logic

**Failure mode:** Neon connection timeout during the async metadata update → session has no `blob_path` → replay is unreachable even though the file exists.

**When it hurts:** Under connection pool pressure (see H-3).

**Severity:** 🟡 **Medium**

**Remediation:**
1. Set a preliminary `blob_path` in the transaction (predicted path based on naming convention)
2. Or: add a reconciliation job that scans for sessions with `blob_path IS NULL` and matches them to existing blobs on disk
3. Or: move blob_path update inside a short retry loop

**Complexity:** Small  
**Timeline:** Before beta

---

### M-6: SDK Singleton Pattern Prevents Multi-Instance Usage

**File:** [vigil-client.ts](file:///d:/Coding/Vigil/packages/sdk/src/client/vigil-client.ts#L27-L28)

**Problem:** The SDK uses module-level singletons:
```typescript
const state = createSDKState();
const lifecycle = createLifecycleManager();
```
Only one Vigil instance can exist per JavaScript context. This prevents:
- Micro-frontend architectures where multiple apps share a page
- Testing with isolated instances
- Future multi-project SDK usage

**When it hurts:** First micro-frontend customer. Testing becomes painful.

**Severity:** 🟡 **Medium**

**Remediation:**
1. Refactor to return a Vigil instance from `init()` instead of mutating module-level state
2. Keep the current singleton behavior as a convenience wrapper
3. Expose `createVigilInstance()` for advanced users

**Complexity:** Medium  
**Timeline:** Before scale

---

### M-7: No Idempotency Key for Ingest Requests

**File:** [ingest.ts](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts)

**Problem:** While individual `events_summary` rows are deduplicated via `ON CONFLICT (id) DO NOTHING`, the session upsert always applies. If the SDK retries a flush after a network timeout (server processed it but the response was lost), the session's `updated_at`, `last_ingest_at`, error flags, and error count can be corrupted.

Specifically, `error_count = error_count + $1` is additive. A retried payload will double-count errors because the `events_summary` dedup returns 0 new rows but the error_count increment happens based on the summary events in the *current* payload, not on what was actually inserted.

**Wait — actually, looking closer:** The error count increment at [line 253-262](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts#L253-L262) is based on `newErrors` which is computed from `summaryResult.rows` (only newly inserted rows). So this is actually correct. The real issue is:
- Session flags (`has_js_error OR EXCLUDED.has_js_error`) are idempotent ✓
- Error count increment is based on actual inserts ✓  
- But `last_ingest_at` and `updated_at` advance on every retry, which can cause premature reconciliation timeout resets

**Severity:** 🟡 **Medium** (lower than initially assessed, but still a concern for triage job duplication and timestamp accuracy)

**Remediation:**
1. Add an idempotency key header (`X-Idempotency-Key`) from the SDK
2. Track seen idempotency keys in a short-lived Redis set or in-memory cache
3. Return the previous response for duplicate requests

**Complexity:** Medium  
**Timeline:** Before scale

---

### M-8: `BIGINT` Timestamps Instead of `TIMESTAMPTZ`

**File:** [0000_initial.sql](file:///d:/Coding/Vigil/apps/api/migrations/0000_initial.sql)

**Problem:** All timestamp columns are `BIGINT` (epoch milliseconds). This creates:
- No timezone awareness in the database layer
- No ability to use PostgreSQL date/time functions natively (`date_trunc`, interval arithmetic, etc.)
- Manual conversion everywhere
- Confusing `SELECT 1716900000000` instead of readable timestamps
- No protection against nonsensical values (negative, far-future)

**When it hurts:** First analytics query. First time-based aggregation. Debugging production data.

**Severity:** 🟡 **Medium**

**Remediation:** This is a schema-level decision that becomes increasingly expensive to change. If you're going to change it, do it before you have customer data. Convert `started_at`, `ended_at`, `created_at`, `updated_at`, `abandoned_at` to `TIMESTAMPTZ`. Keep `timestamp_ms` in `events_summary` and `duration_ms` as integers.

**Complexity:** Medium  
**Timeline:** Before beta (or accept the debt permanently)

---

### M-9: No Health Check for Database Connectivity

**File:** [health.ts](file:///d:/Coding/Vigil/apps/api/src/routes/health.ts)

**Problem:** The health endpoint returns `{ status: "ok" }` unconditionally without checking database connectivity. A `checkDatabaseConnection()` function exists in [db.ts](file:///d:/Coding/Vigil/apps/api/src/db.ts#L44) but is never called.

**Failure mode:** The API process is alive but the database is unreachable (connection pool exhausted, Neon cold start, network partition). The health check returns 200, the load balancer continues routing traffic, and every ingest request fails with a 500.

**When it hurts:** First database outage.

**Severity:** 🟡 **Medium**

**Remediation:**
1. Add `/health/ready` that checks database connectivity
2. Keep `/health/live` as a simple process liveness check
3. Use `/health/ready` for load balancer health checks
4. Add connection pool metrics to the health response

**Complexity:** Small  
**Timeline:** Immediately

---

## 5. Low Priority Findings

### L-1: CORS Policy Reflects Any Origin

**File:** [app.ts](file:///d:/Coding/Vigil/apps/api/src/app.ts#L71)

`origin: (origin) => origin || "*"` reflects any Origin header. This is intentionally permissive for SDK ingestion, but combined with `credentials: true`, it means any website can make authenticated cross-origin requests to the API. For the ingest endpoint this is acceptable (public key auth). For future dashboard API routes, this is a CSRF vector.

**Severity:** 🟢 **Low** (for current scope; becomes **High** when dashboard API is added)

**Remediation:** Split CORS config: permissive for `/api/v1/ingest`, strict for dashboard API routes.

**Complexity:** Small  
**Timeline:** Before beta

---

### L-2: SDK Version is Hardcoded

**File:** [vigil-client.ts](file:///d:/Coding/Vigil/packages/sdk/src/client/vigil-client.ts#L24)

`const SDK_VERSION = "0.1.0"` is hardcoded instead of derived from `package.json`. This will inevitably drift from the actual published version.

**Severity:** 🟢 **Low**

**Remediation:** Import version from package.json or inject at build time via `tsup`'s define option.

**Complexity:** Small  
**Timeline:** Before beta

---

### L-3: Console Dedupe Cache Clears Entirely at MAX_DEDUPE

**File:** [console.ts](file:///d:/Coding/Vigil/packages/sdk/src/console.ts#L109-L111)  
**File:** [errors.ts](file:///d:/Coding/Vigil/packages/sdk/src/errors.ts#L63-L65)

When `recentErrors.size >= MAX_DEDUPE`, the entire set is cleared. This means errors that were being deduplicated suddenly get re-reported. A noisy error that fires 100 times will be deduped for the first 50, then the cache clears and it fires again.

**Severity:** 🟢 **Low**

**Remediation:** Use a ring buffer or LRU cache instead of clearing the entire set. Or keep the clear but increase `MAX_DEDUPE` and add a time-based expiry.

**Complexity:** Small  
**Timeline:** Before scale

---

### L-4: No `TEXT` Column Length Constraints in Database

**File:** [0000_initial.sql](file:///d:/Coding/Vigil/apps/api/migrations/0000_initial.sql)

All string columns are `TEXT` with no length constraints (except validation at the Zod level). If validation is bypassed or changed, the database has no protection against unbounded string storage.

**Severity:** 🟢 **Low**

**Remediation:** Add `VARCHAR(n)` constraints on key columns or add `CHECK` constraints.

**Complexity:** Small  
**Timeline:** Before scale

---

### L-5: `github_token` Stored in Plaintext

**File:** [0000_initial.sql](file:///d:/Coding/Vigil/apps/api/migrations/0000_initial.sql#L15)

`github_token TEXT` — the architecture doc says "Token is encrypted at rest" but there's no encryption implementation. The token is stored as plaintext in the database.

**Severity:** 🟢 **Low** (no GitHub integration implemented yet, but becomes **Critical** when it is)

**Remediation:** Encrypt at rest using an application-level encryption key. Use a secrets manager (AWS Secrets Manager, Vault) for the encryption key.

**Complexity:** Small  
**Timeline:** Before GitHub integration

---

### L-6: No Request Timeout on Ingest Transactions

**File:** [ingest.ts](file:///d:/Coding/Vigil/apps/api/src/routes/ingest.ts)

The database transaction has no statement timeout or total execution timeout. A slow query (e.g., during database maintenance or lock contention) will hold a connection indefinitely.

**Severity:** 🟢 **Low**

**Remediation:** Add `SET LOCAL statement_timeout = '5s'` inside the transaction.

**Complexity:** Small  
**Timeline:** Before beta

---

## 6. Scalability Roadmap

### What Breaks at 100 Users (~500 sessions/day)

| Component | Status |
|---|---|
| Ingest API | ✅ Holds (single instance) |
| Database | ✅ Holds (Neon free tier) |
| Blob Storage | ⚠️ Disk fills in weeks without retention |
| Dashboard | ❌ Non-functional (mock data) |
| AI Triage | ❌ Non-functional (no worker) |
| Rate Limiting | ❌ One misbehaving SDK can exhaust the DB |

### What Breaks at 1,000 Users (~5,000 sessions/day)

| Component | Status |
|---|---|
| Connection Pool | ❌ Exhausts under concurrent load |
| Blob Storage | ❌ Fills disk (estimated ~2GB/day uncompressed) |
| `events_summary` | ⚠️ ~100K rows/day, query latency increases |
| Reconciliation Worker | ⚠️ Scans entire table every minute |
| Ingest Latency | ⚠️ `JSON.stringify` in event loop blocks requests |

### What Breaks at 10,000 Users (~50,000 sessions/day)

| Component | Status |
|---|---|
| Single API Instance | ❌ Must horizontally scale |
| Blob Storage | ❌ Must move to object storage |
| Reconciliation | ❌ Must use distributed locking |
| Database | ❌ Neon free tier limits hit, need partitioning |
| AI Costs | ❌ ~50,000 Claude API calls/day (after noise skip) |

### What Breaks at 100,000 Users (~500,000 sessions/day)

| Component | Status |
|---|---|
| PostgreSQL | ❌ Must shard or use ClickHouse for analytics |
| Ingest Pipeline | ❌ Must buffer through Kafka/SQS |
| Blob Storage | ❌ ~100GB/day, need tiered storage |
| AI Pipeline | ❌ Need batch processing, cost optimization, rate limiting |
| Dashboard | ❌ Need read replicas, caching, materialized views |

---

## 7. Production Readiness Score

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | 5/10 | Sound vision, but missing auth, multi-tenancy, and worker separation |
| **Backend API** | 6/10 | Transactional ingest is solid, but no rate limiting, no auth, unvalidated events |
| **Database** | 4/10 | No FKs, no partitioning, no retention, BIGINT timestamps, no RLS |
| **SDK** | 7/10 | Well-structured, proper lifecycle, good defensive coding |
| **AI Pipeline** | 1/10 | Queue exists, no consumer, no prompts, no output parsing |
| **Security** | 2/10 | No auth on dashboard, no rate limiting, public key is the only "auth" |
| **Scalability** | 3/10 | Single instance only, local disk, no connection pool tuning |
| **Reliability** | 4/10 | Async blob loss risk, no dead-letter, no retry for blob persistence |
| **Testing** | 6/10 | Good unit test coverage for API and SDK, but no integration or E2E tests |
| **Operations** | 2/10 | Console logging only, no metrics, no alerting, no CI/CD |
| **Developer Experience** | 6/10 | Clean code, good docs, monorepo structure, but mock dashboard |
| **Technical Debt** | 5/10 | Moderate debt, mostly from deferred work rather than bad abstractions |

### **Overall: 4.2 / 10**

The SDK and ingest transaction logic are the strongest areas. Everything downstream of ingestion (AI, dashboard, operations, security) ranges from non-functional to dangerously incomplete.

---

## 8. Top 10 Changes Before Launch

| Priority | Change | Severity | Complexity | Timeline |
|---|---|---|---|---|
| **1** | Add authentication and authorization to dashboard/API | Critical | Medium | Immediately |
| **2** | Add rate limiting to ingest endpoint | Critical | Medium | Immediately |
| **3** | Add foreign key constraints on non-hot-path tables | Critical | Small | Before beta |
| **4** | Implement the AI triage worker | High | Large | Before beta |
| **5** | Build real dashboard API (replace mock data) | High | Large | Before beta |
| **6** | Migrate blob storage to S3/R2 | High | Large | Before first paying customer |
| **7** | Configure connection pool and add statement timeouts | High | Small | Immediately |
| **8** | Add CI/CD pipeline (test + build + deploy) | High | Small | Immediately |
| **9** | Fix session ID collision vulnerability (composite PK or project_id guard) | Medium | Medium | Before beta |
| **10** | Add health check with database readiness probe | Medium | Small | Immediately |

---

## Appendix: Technical Debt Inventory

### Temporary Solutions That Will Become Permanent

1. **Local disk blob storage** — This will never be migrated if the path is stored as a local path. Every consumer that reads `blob_path` will hardcode local filesystem assumptions.
2. **Mock dashboard data** — The longer this stays, the more the UI diverges from real data shapes.
3. **`console.log` as the only observability** — Engineers will never add structured logging if `console.log` "works."

### Hidden Complexity

1. **The upsert SQL in ingest.ts** (lines 88-155) is a 67-line SQL statement with 19 parameters, nested CASE/WHEN, GREATEST/COALESCE chains, and implicit type casting. This is the most critical query in the system and it has no comments explaining the CASE logic.
2. **The SDK's `Proxy`-based summary event guard** ([state.ts:51-68](file:///d:/Coding/Vigil/packages/sdk/src/client/state.ts#L51-L68)) is clever but non-obvious. A new engineer will not understand why `push()` silently drops events.

### Overengineering

1. **`BlobPersistenceResult`** has duplicate fields for backwards compatibility (`path`/`filePath`, `compressedBytes`/`compressedSize`, etc.) but there is no backwards-compatible consumer. Remove the duplicates.
2. **`buildSnapshotPayload`** copies both arrays unnecessarily for visibility flushes — could be simplified.

### Underengineering

1. **No structured logging** — Every log is a template string. No log levels, no JSON output, no trace correlation beyond `reqId`.
2. **No metrics** — No request count, latency percentiles, error rates, pool utilization, blob sizes, or queue depths.
3. **No error classification** — All 500s look the same. No distinction between "DB timeout" vs "invalid data" vs "blob write failure."

### Missing Abstractions

1. **No repository/data access layer** — SQL is inlined in route handlers. When the dashboard API needs the same queries, they'll be duplicated.
2. **No event bus or domain events** — When AI triage, GitHub integration, and analytics need to react to session finalization, they'll all add code to the ingest handler.
3. **No project service** — Project validation is a raw SQL query in the ingest handler. When settings, quotas, and feature flags are added, this query will grow into a monster.
