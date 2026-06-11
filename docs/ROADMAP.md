# Vigil — Roadmap

> MVP only. Ship the triage loop end-to-end before anything else.

---

## Milestone 0 — Project Setup

Get the monorepo, tooling, and database in place before writing any product code.

- [x] Init pnpm workspace at root (`pnpm init`, `pnpm-workspace.yaml`)
- [x] Create folder structure: `packages/sdk`, `apps/api`, `apps/web`
- [x] Add root `tsconfig.base.json` shared across packages
- [x] Add `turbo.json` for build/dev orchestration (optional but recommended)
- [x] Create Neon project, copy connection string to `.env`
- [x] Write Postgres migrations from `docs/vigil-data-schema.md`
  - [x] `users`
  - [x] `projects`
  - [x] `sessions`
  - [x] `events_summary`
  - [x] `issue_groups`
  - [x] `issue_instances`
  - [x] `ai_triage_runs`
  - [x] Add all indexes from schema doc
- [x] Fix Postgres types: `BOOLEAN` instead of `INTEGER` for flags, `BIGINT` for `timestamp_ms` fields
- [x] Set up a migration runner (`node-postgres` + raw SQL files, or `drizzle-kit`)

---

## Milestone 1 — SDK (`packages/sdk`)

Ship a working `@vigil/sdk` that captures signals and flushes them to an ingest endpoint.

- [x] Init TypeScript package, configure `tsup` for dual CJS/ESM build
- [x] Integrate `rrweb/record` for DOM capture
- [x] Implement session ID generation and persistence via `sessionStorage`
- [x] Implement in-memory event buffer
- [x] Implement flush timer (default 5s)
- [x] Implement `navigator.sendBeacon` final flush on `beforeunload`/`pagehide`
- [x] Implement retry logic: up to 3 retries on failed normal flushes, then drop silently
- [x] Wire `window.onerror` and `window.onunhandledrejection` → JS error summary events
- [x] Wire `console.error` monkey patch → console error summary events
- [x] Wire `fetch` and `XMLHttpRequest` interceptors → network failure summary events (4xx/5xx only) -- squash and merged May 15
- [x] Implement rage click detection (3+ clicks, 500px area, 2s window) -- May 15 onwards 
- [x] Implement dead click detection (click + no DOM mutation/navigation within 500ms)
- [x] Implement significant click summary events (`button`, `a`, `[role=button]`)
- [x] Implement SPA navigation tracking (`pushState`, `replaceState`, `popstate`)
- [x] Implement `maskAllInputs` (default on) and always-on password masking
- [x] Implement `Vigil.init()` with all options from `docs/vigil-sdk-contract.md`
- [x] Implement `sessionSampleRate` check at init
- [x] Implement `isFinal: true` on final flush
- [x] Write a test page that loads the SDK and generates all signal types
- [ ] Bundle size audited (25KB budget not yet met) -- 27KB. 

---

## Milestone 2 — Ingest API (`apps/api`)

Accept SDK payloads, store them, extract signals, and queue triage.

- [x] Init Node.js + Hono app
- [x] `POST /api/ingest` endpoint
- [x] Validate `projectKey` against `projects.public_key`
- [x] Enforce max batch size (500 events, 50 summary events, 2MB payload)
- [x] Upsert session row in `sessions`
- [x] Store raw rrweb events as gzipped chunk files on local disk under `BLOBS_ROOT/{project_id}/{session_id}/` (for example: `${timestamp}_${randomSuffix}_events.json.gz`)
- [x] Write summary events to `events_summary`
- [x] Set session flags: `has_js_error`, `has_rage_click`, `has_network_err`, `has_dead_click`, `error_count`
- [x] Implement deterministic fingerprinting per signal type (see architecture doc)
- [x] On `isFinal: true`: mark `sessions.ended_at`, compute `duration_ms`
- [x] On `isFinal: true`: evaluate noise skip conditions, set `ai_analysis_skipped` if applicable
- [x] On `isFinal: true` + not skipped: enqueue AI triage job
- [x] Configure CORS correctly for cross-origin SDK installs
- [x] Return `200 { ok: true }` quickly — all heavy work is async
- [x] Test end-to-end with the SDK test page from Milestone 1

---

## Milestone 3 — AI Triage Agent (`apps/api`)

Run the triage loop for every completed non-noise session.

- [x] Set up job queue (BullMQ + Redis, or a simple Postgres-backed queue for MVP)
- [x] Implement triage job worker
- [x] Assemble compact timeline from `events_summary` for a session
- [x] Fetch candidate issue groups by fingerprint match
- [x] Build Claude API prompt (see architecture doc for input/output schema)
- [x] Call Claude API, cap response tokens
- [x] Validate AI JSON output before writing to DB
- [x] On parse failure: store error in `ai_triage_runs`, retry once with a repair prompt
- [x] Write AI fields back to `sessions` (summary, goal_completed, friction_score, etc.)
- [x] On `issue_group_action: create`: insert new row into `issue_groups`
- [x] On `issue_group_action: attach`: increment `affected_session_count`, update `last_seen_at`
- [x] On `issue_group_action: ignore`: mark session as analyzed, no issue written
- [x] Insert row into `issue_instances` for create and attach actions
- [x] Insert row into `ai_triage_runs` for every run (success, skip, or failure)
- [x] Test with real sessions from the SDK test page

---

## Milestone 4 — Dashboard (`apps/web`)

Build the issue-first developer UI.

- [x] Init Next.js 14 app (App Router)
- [ ] Set up Clerk or NextAuth for auth (will do in the end)
- [x] Project creation flow + display of `public_key` for SDK install
- [x] `/issues` — grouped issue list
  - [x] Sort by severity, affected sessions, last seen, confidence
  - [x] Filter by severity, environment, release, GitHub status
  - [x] Severity badge, title, session count, last seen, confidence
- [x] `/issues/[id]` — issue detail
  - [x] AI bug report: title, root cause, suggested fix, severity, confidence
  - [x] Reproduction steps
  - [x] Evidence timeline
  - [x] Affected sessions list
  - [x] Representative replay links
  - [x] GitHub action button (placeholder until Milestone 5)
- [x] `/sessions` — session list sortable by friction score, date, severity
- [x] `/sessions/[id]` — session detail
  - [x] rrweb-player replay
  - [x] AI issue markers on the playback timeline
  - [x] Session summary, friction score, goal completion
  - [x] Linked issue groups
- [x] `/settings` — SDK install instructions, project key display
- [x] Test full loop: SDK → ingest → triage → issue visible in dashboard

---

## Milestone 5 — GitHub Integration

Wire Octokit to the issue queue.

- [ ] GitHub OAuth flow: connect account, select target repo, encrypt and store token
- [ ] `/settings`: GitHub connection status and repo selector
- [ ] "Raise GitHub Issue" button on `/issues/[id]`
- [ ] Generate GitHub issue body from AI report (title, severity, sessions, replay links, steps, root cause, fix, stack, manual comment)
- [ ] Apply labels: `bug`, `vigil-detected`, `vigil-p{severity}`
- [ ] Store `github_issue_url` and `github_issue_number` on `issue_groups`, set status to `linked`
- [ ] Guard against creating duplicate GitHub issues for the same group
- [ ] Manual comment field before raising or updating
- [ ] Auto-raise mode
  - [ ] Add toggle + threshold config to `/settings`
  - [ ] Fire auto-raise on `create` action when severity and confidence thresholds are met
  - [ ] Tag auto-raised issues with `vigil-auto-raised`, set `github_auto_raised = 1`
- [ ] AI follow-up comments
  - [ ] Add toggle to `/settings`
  - [ ] Post batched comment when `affected_session_count` crosses threshold since last comment
  - [ ] Update `github_last_comment_at` and `github_last_comment_session_count`

---

## Milestone 6 — MVP Polish

Get the demo loop clean enough to show.

- [ ] Error states and loading skeletons on all dashboard pages
- [ ] Empty states for new projects with no sessions yet
- [ ] SDK install instructions page with copy-pasteable snippet
- [ ] Basic rate limiting on ingest endpoint
- [ ] Blob storage: move from local disk to Cloudflare R2 or S3
- [ ] Environment variable validation at startup (fail fast if keys are missing)
- [ ] Deploy `apps/api` and `apps/web` to Railway or Fly.io
- [ ] Connect deployed apps to Neon DB
- [ ] Run the full demo loop end-to-end in production

---

## Out of Scope (Not in MVP)

- Heatmaps
- Product analytics
- A/B testing
- Core Web Vitals
- Auto-fix PRs
- Slack / WhatsApp alerts
- Mobile SDKs
- Team collaboration and assignments
- Billing
- Self-hosting
- Custom AI prompt configuration
