# Vigil — System Architecture

> MVP scope only. AI-first triage, no unnecessary platform sprawl.

---

## High-Level Flow

```text
[User Browser]
     |
     | rrweb events + summary signals, batched
     v
[Vigil SDK]
     |
     | flush every 5s or on page unload
     v
[Ingest API] — Node.js/Hono
     |
     |-- validates project key and payload
     |-- appends raw rrweb batch to blob storage
     |-- upserts session record
     |-- writes structured signals
     |-- computes cheap fingerprints
     |-- queues AI triage when session ends
     v
[Signal Extractor]
     |
     |-- stores timeline events in events_summary
     |-- sets session flags and counts
     |-- computes candidate issue fingerprints
     |-- does not replace AI judgment
     v
[AI Triage Agent] — Claude API
     |
     |-- input: compact timeline + metadata + candidate issue groups
     |-- decides: normal session, new issue, duplicate issue, or noise
     |-- outputs: summary, friction score, goal completion, issues, evidence, reproduction steps
     |-- creates or attaches to issue groups
     v
[Session Store] — Neon (Postgres)
     |
     |-- sessions
     |-- events_summary
     |-- issue_groups
     |-- issue_instances
     |-- users/projects
     v
[Dashboard] — Next.js
     |
     |-- /issues: primary AI triage queue
     |-- /issues/[id]: grouped bug report with evidence
     |-- /sessions: supporting session list
     |-- /sessions/[id]: replay with AI markers
     v
[GitHub Integration] — Octokit
     |
     |-- one GitHub issue per issue group
     |-- updates existing issue groups instead of creating duplicates
     |-- includes replay links, reproduction steps, root cause, suggested fix, evidence, and manual comment
     |-- auto-raise mode: raises GitHub issues automatically for high-confidence P0/P1s (opt-in, per project)
     |-- AI follow-up comments: posts new evidence to existing GitHub issues as more sessions are detected
```

---

## Architecture Principle

Vigil is AI-first at the workflow layer and conservative at the infrastructure layer.

Commodity pieces stay simple:

- rrweb capture.
- batched ingest.
- blob storage.
- structured signal extraction.
- async job queue.
- Next.js dashboard.
- Octokit integration.

Differentiation lives in the triage loop:

- AI decides whether a session matters.
- AI groups duplicate failures.
- AI writes developer-ready bug reports.
- AI prepares GitHub issues with evidence and reproduction steps.

---

## Components

### 1. SDK (`@vigil/sdk`)

Thin wrapper around `rrweb/record`.

Captures:

- DOM mutations, clicks, scrolls, and masked inputs through rrweb.
- JS exceptions via `window.onerror` and `window.onunhandledrejection`.
- Console errors via `console.error` monkey patch.
- Network failures via `fetch` and `XMLHttpRequest` interception.
- SPA navigations via `pushState`, `replaceState`, and `popstate`.
- Rage clicks.
- Dead clicks.
- Significant clicks on interactive elements (`button`, `a`, `[role=button]`) as structured summary events.

Batching:

- Keeps events in memory.
- Flushes every 5 seconds by default.
- Performs final flush with `navigator.sendBeacon` on page unload.
- Retries failed normal flushes up to 3 times, then drops silently.

Privacy:

- Masks all `input`, `textarea`, and `select` values by default.
- Always masks `input[type=password]`, with no opt-out.
- Does not capture cross-origin iframe contents, file input contents, or WebSocket message bodies.

Metadata:

- Sends `sdkVersion`.
- Sends optional release metadata when configured: `release`, `commitSha`, `environment`, and `userId`.

The SDK does not call AI, render UI, or classify bugs.

---

### 2. Ingest API

Node.js + Hono.

Endpoint:

```text
POST /api/ingest
```

Accepts:

```typescript
{
  sessionId: string;
  projectKey: string;
  events: object[];
  summary: SummaryEvent[];
  metadata: SessionMetadata;
  isFinal: boolean;
  sdkVersion: string;
}
```

Responsibilities:

- Validate `projectKey` against `projects.public_key`.
- Enforce max batch size.
- Store raw rrweb events as gzipped blobs.
- Upsert the session row.
- Store structured summary events.
- Update session flags.
- Compute deterministic issue fingerprints.
- On `isFinal: true`, mark the session ended and queue AI triage unless skipped as noise.

The endpoint returns quickly. AI work is asynchronous.

---

### 3. Blob Storage

Raw rrweb event blobs are stored separately from the database.

MVP:

- Local disk.
- Gzipped JSON.

Later:

- Cloudflare R2 or S3.

The AI never receives raw replay blobs. Raw blobs are used only for replay in the dashboard.

---

### 4. Session Store

Neon (serverless Postgres).

Core tables:

- `projects`
- `users`
- `sessions`
- `events_summary`
- `issue_groups`
- `issue_instances`

`sessions` stores the per-session AI result: summary, goal completion, friction score, skip status, and signal flags.

`issue_groups` stores the deduplicated developer-facing issue.

`issue_instances` links a session to a grouped issue and stores session-specific evidence.

---

### 5. Signal Extractor

Runs synchronously during ingest.

It processes SDK summary events and writes normalized rows into `events_summary`.

It also:

- Sets `has_js_error`, `has_rage_click`, `has_network_err`, and `has_dead_click`.
- Increments `error_count`.
- Sanitizes and truncates string fields.
- Drops malformed events.
- Produces deterministic candidate fingerprints for triage.

The signal extractor does not decide whether something is a product bug. It gives the AI cleaner, cheaper input.

---

### 6. Fingerprinting

Fingerprinting is deterministic and cheap. It helps the AI reason about duplicates.

Examples:

- JS error fingerprint: route + normalized error message + top application stack frame.
- Network fingerprint: route + method + normalized URL path + status code.
- Rage click fingerprint: route + target selector + nearby previous action.
- Dead click fingerprint: route + target selector + absence of mutation/navigation.

Fingerprints are candidate evidence, not final truth. The AI can create a new issue group, attach to an existing group, or ignore the session.

---

### 7. AI Triage Agent

Runs asynchronously for every completed non-noise session.

Noise skip conditions:

- Session duration under 5 seconds.
- Zero summary events.
- Missing replay blob.

Input:

```json
{
  "session": {
    "id": "ses_x9y8z7",
    "url": "https://example.com/checkout",
    "duration_ms": 142000,
    "started_at": 1716900000000,
    "release": "web-2026.05.08",
    "commit_sha": "a81f9d",
    "environment": "production"
  },
  "timeline": [
    { "type": "navigation", "nav_to": "/checkout", "timestamp_ms": 0 },
    { "type": "click", "target": "#pay-btn", "timestamp_ms": 12400 },
    { "type": "network_error", "url": "/api/payment", "status": 500, "method": "POST", "timestamp_ms": 12450 },
    { "type": "rage_click", "target": "#pay-btn", "count": 4, "timestamp_ms": 12500 },
    { "type": "js_error", "message": "TypeError: Cannot read properties of undefined", "stack": "...", "timestamp_ms": 12510 }
  ],
  "candidate_issue_groups": [
    {
      "id": "igr_payment_500",
      "title": "Payment submission fails with 500",
      "fingerprint": "network:checkout:POST:/api/payment:500",
      "affected_session_count": 17,
      "last_seen_at": 1716900020000
    }
  ]
}
```

Output:

```json
{
  "session_summary": "User attempted checkout and could not submit payment after POST /api/payment returned 500.",
  "goal_completed": false,
  "friction_score": 92,
  "issue_detected": true,
  "issue_group_action": "attach",
  "issue_group_id": "igr_payment_500",
  "issues": [
    {
      "title": "Payment submission fails with 500 error",
      "root_cause": "POST /api/payment returns 500 immediately after the pay button click. The UI does not show a recoverable error state.",
      "suggested_fix": "Investigate the payment creation handler for missing or invalid payment intent data, then ensure the frontend handles non-2xx responses with a visible error message.",
      "severity": "P0",
      "timestamp_ms": 12450,
      "confidence": 0.91,
      "reproduction_steps": [
        "Open /checkout",
        "Click the pay button",
        "Observe POST /api/payment returning 500",
        "Observe no clear user-facing recovery path"
      ],
      "evidence": [
        { "type": "network_error", "timestamp_ms": 12450, "detail": "POST /api/payment returned 500" },
        { "type": "rage_click", "timestamp_ms": 12500, "detail": "User clicked #pay-btn 4 times" }
      ]
    }
  ]
}
```

Model constraints:

- Use structured timeline, not raw replay.
- Cap model response size.
- Keep prompts deterministic and JSON-only.
- Validate AI output before writing to DB.
- Store parse failures and retry once with a repair prompt.

---

### 8. Dashboard

Next.js.

Primary workflow starts at `/issues`, not `/sessions`.

Issue list:

- Grouped issue rows.
- Severity, title, affected sessions, confidence, first seen, last seen, GitHub status.
- Sort by severity, affected session count, last seen, and confidence.

Issue detail:

- AI report.
- Evidence timeline.
- Reproduction steps.
- Representative replays.
- Affected sessions.
- GitHub action.

Session detail:

- rrweb-player replay.
- AI markers on the timeline.
- Session summary.
- Friction score.
- Goal completion.
- Linked issue groups.

---

### 9. GitHub Integration

Octokit.

OAuth flow:

- User connects GitHub.
- User selects target repository.
- Token is encrypted at rest.

Issue creation:

- One GitHub issue per `issue_group`.
- Existing issue group updates link new sessions instead of creating duplicates.

GitHub issue content:

- Title.
- Severity.
- Affected session count.
- First seen and last seen.
- Representative replay links.
- Reproduction steps.
- Root cause.
- Suggested fix.
- Error stack or network failure details.
- Manual developer comment.

Labels:

- `bug`
- `vigil-detected`
- `vigil-p0` through `vigil-p3`

Auto-raise mode:

- Opt-in, configured per project in `/settings`.
- When enabled, Vigil automatically raises a GitHub issue for any new issue group where severity is P0 or P1 and AI confidence meets or exceeds the configured threshold (default: 0.90).
- Auto-raised issues are tagged with `vigil-auto-raised`.
- Developers are notified in the dashboard and can edit or close the GitHub issue directly.
- Auto-raise never fires for `ignore` or `attach` actions — only on `create` for new issue groups.
- Auto-raise is intentionally restricted to high-confidence signals to prevent hallucinated or low-quality issues from appearing in the repo without human review.

AI follow-up comments:

- When new sessions are attached to an existing issue group that already has a GitHub issue, Vigil posts a follow-up comment on that GitHub issue.
- Comment content includes: updated affected session count, any new reproduction paths discovered, and new evidence types observed in the latest sessions.
- Comments are batched — Vigil does not comment once per session. Comments fire when a meaningful threshold is crossed (e.g., session count doubles, or a new reproduction path is found).
- Follow-up commenting is opt-in and configured separately from auto-raise.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| SDK | TypeScript | Type safety and rrweb ecosystem fit |
| Capture | rrweb/record | Standard replay capture primitive |
| Backend | Node.js + Hono | Lightweight TypeScript API |
| Frontend | Next.js 14 | Existing stack |
| Database | Neon (Postgres) | Serverless, zero-ops, free tier |
| Blob storage | Local disk dev, R2/S3 prod | Cheap replay storage |
| AI | Claude API | Strong reasoning over structured timelines |
| GitHub | Octokit | Official GitHub client |
| Auth | Clerk or NextAuth | Avoid custom auth |
| Hosting | Railway or Fly.io | Low-friction deployment |

---

## Known Risks

### AI cost

AI runs for every completed non-noise session. Keep costs bounded by sending only compact timelines, capping response tokens, skipping noise, and passing only a small set of candidate issue groups.

### Duplicate quality

Bad grouping creates noisy or misleading issues. Use deterministic fingerprints first, then let AI choose create/attach/ignore with confidence.

### Hallucinated root causes

AI root causes must be framed as likely causes or suggested investigation paths. Always pair claims with replay evidence and structured timeline events.

### Replay storage growth

Cap replay retention. Compress blobs. Retain long-term replay blobs only for sessions linked to issue groups or sampled examples.

### Privacy concerns

The AI never sees raw rrweb blobs or unmasked input values. Only structured summaries are sent to the model.

### GitHub OAuth trust

Use the minimum viable scopes and clearly state that Vigil creates issues only. It does not read or write source code.

### Cross-origin ingest

CORS must be configured correctly for SDK installs on customer domains.
