# Vigil — Product Spec (MVP)

> Last updated: May 2026  
> Status: Pre-build  
> Positioning: AI-first bug triage from real user sessions

---

## What It Is

Vigil is an AI-native bug triage platform for developers. It watches real user sessions, detects broken UX, clusters repeated failures, explains the likely cause, and turns those failures into actionable GitHub issues.

Vigil is not positioned as a general session replay tool. Replay is evidence. The core product is the AI triage loop that converts messy user behavior into a developer-ready issue queue.

**Who it's for:** Developers and small dev teams building web apps who want real user failures surfaced before users file support tickets.

**Core promise:**

> Automatically convert broken real-user sessions into deduplicated GitHub-ready bug reports.

---

## How Vigil Works

1. **Record** — install `@vigil/sdk`. It captures DOM mutations, clicks, scrolls, masked inputs, console errors, JS exceptions, network failures, and navigations using rrweb. No raw input values leave the browser.
2. **Ingest** — events are batched and flushed to Vigil's ingest API. Sessions are processed asynchronously and non-noise sessions enter the triage pipeline automatically.
3. **Triage** — the AI makes a verdict on every session: normal behavior, a new bug, or a duplicate of a known failure. Repeated failures cluster into a single issue group — not one report per affected user.
4. **Act** — developers work from a prioritized issue queue, not a list of sessions. Each issue comes with AI-written root cause, reproduction steps, a suggested fix, and a one-click path to a pre-filled GitHub issue.

---

## MVP Feature List

1. Drop-in JavaScript SDK using rrweb under the hood.
2. Captures DOM mutations, clicks, scrolls, masked inputs, JS exceptions, console errors, network failures, rage clicks, dead clicks, and page navigations.
3. Privacy-first capture: all text inputs masked by default; passwords always masked with no opt-out.
4. Batched session ingestion API.
5. Structured signal extraction for every session.
6. AI triage on every completed non-noise session.
7. Issue grouping and deduplication across sessions.
8. AI-generated developer bug reports with title, likely root cause, suggested fix, severity, reproduction steps, confidence, and evidence.
9. Friction score per session.
10. Sessions dashboard for replay and per-session AI context.
11. Issues dashboard showing grouped failures sorted by severity, affected session count, recency, and status.
12. Session replay viewer with AI issue markers on the timeline.
13. AI insights sidebar with session summary, goal completion, friction score, and issue evidence.
14. GitHub integration that raises one issue per issue group, not one issue per session.
15. Manual comment field before raising or updating a GitHub issue.
16. Auto-raise mode: opt-in, per-project setting that automatically raises a GitHub issue for new P0/P1 issue groups when AI confidence meets a configured threshold.
17. AI follow-up comments: when new sessions attach to an issue group that already has a GitHub issue, Vigil posts a batched update comment with new evidence and updated session counts.

---

## AI-First Product Principle

AI is not a decorative summary layer. In Vigil, AI owns the triage decision:

- Is this session normal, noisy, or broken?
- What was the user trying to do?
- Did they complete their goal?
- What issue, if any, occurred?
- Is this a new issue or a duplicate of an existing issue?
- What evidence supports that decision?
- What should a developer investigate first?

Deterministic code still handles capture, validation, storage, signal extraction, and low-cost fingerprints. Those systems make the AI cheaper, safer, and easier to verify. The product experience remains AI-first because the user-facing object is an AI-maintained issue queue.

---

## AI Triage Output

For each completed non-noise session, the AI triage pipeline produces structured output:

```typescript
type AITriageOutput = {
  session_summary: string;
  goal_completed: boolean;
  friction_score: number; // 0-100
  issue_detected: boolean;
  issue_group_action: "create" | "attach" | "ignore";
  issue_group_id?: string;
  issues: Array<{
    title: string;
    root_cause: string;
    suggested_fix: string;
    severity: "P0" | "P1" | "P2" | "P3";
    reproduction_steps: string[];
    timestamp_ms: number;
    confidence: number; // 0-1
    evidence: Array<{
      type: "js_error" | "network_error" | "rage_click" | "dead_click" | "navigation" | "click";
      timestamp_ms: number;
      detail: string;
    }>;
  }>;
};
```

The AI does not receive the raw rrweb replay blob. It receives a compact structured timeline assembled from `events_summary`, session metadata, and known issue group candidates.

---

## Issue Grouping

Vigil should avoid producing 500 separate bug reports for 500 users hitting the same failure. It should produce one issue group with 500 affected sessions.

Issue groups are clustered by a combination of deterministic fingerprinting and AI judgment:

- JS errors: normalized message, normalized stack frame, route, and nearby user action.
- Network failures: method, normalized endpoint, status code, route, and preceding action.
- Rage/dead clicks: route, selector, nearby navigation state, and lack of response.
- Navigation friction: repeated path loops, abandonment point, and failed goal pattern.
- AI semantic match: title, root cause, reproduction path, and evidence similarity.

Grouped issues are the primary operational object in the dashboard and GitHub integration.

---

## Severity Tiers

| Tier | Label | Criteria |
|---|---|---|
| P0 | Critical | App-breaking failure, payment/auth failure, crash, data loss, or a repeated production regression blocking a core flow |
| P1 | High | User clearly could not complete their goal, repeated failed attempts, rage clicks, or many affected sessions |
| P2 | Medium | User completed the goal with visible friction, confusing UI, recoverable errors, or limited impact |
| P3 | Low | Minor UX issue, isolated confusion, unclear impact, or low-confidence issue |

Severity is assigned by AI using session context, evidence strength, affected session count, and workflow importance.

---

## GitHub Workflow

GitHub issues are raised per issue group.

The generated GitHub issue includes:

- AI-generated title.
- Severity label.
- Affected session count.
- First seen and last seen timestamps.
- Representative replay links.
- Reproduction steps.
- Likely root cause.
- Suggested fix or investigation path.
- Relevant JS stack trace or network failure details.
- Developer's manual comment, if provided.

If a GitHub issue already exists for the group, Vigil links new sessions to the existing issue instead of creating duplicates.

### Auto-Raise Mode

Developers can enable auto-raise per project in `/settings`. When active:

- Vigil automatically raises a GitHub issue for any newly created issue group with severity P0 or P1 and AI confidence at or above the configured threshold (default: 90%).
- Auto-raised issues are tagged `vigil-auto-raised` and surfaced in the dashboard.
- Auto-raise only fires on `create` actions — not on `attach` or `ignore`.
- This setting is opt-in and defaults to off. It is intentionally restricted to high-confidence signals to avoid polluting the repo with AI noise.

### AI Follow-Up Comments

When new sessions are attached to an existing issue group that already has an open GitHub issue:

- Vigil posts a follow-up comment on that GitHub issue with updated evidence.
- Comments include: updated affected session count, any new reproduction paths found, and new signal types observed.
- Comments are batched — Vigil does not comment once per individual session.
- Follow-up commenting is opt-in and configured independently of auto-raise.

---

## Dashboard Views

### `/issues`

Primary dashboard view.

- Grouped issue list.
- Sort by severity, affected session count, first seen, last seen, confidence, or status.
- Filter by route, environment, release, signal type, GitHub status, and severity.
- Open issue detail page with representative sessions and AI explanation.

### `/issues/[id]`

Issue detail page.

- AI bug report.
- Reproduction steps.
- Root cause and suggested fix.
- Representative session replays.
- Timeline evidence.
- Affected sessions list.
- GitHub issue state.
- Manual comment field.

### `/sessions`

Supporting view.

- List of sessions sortable by friction score, issue count, date, and severity.
- Useful for debugging individual user journeys and validating AI decisions.

### `/sessions/[id]`

Session detail page.

- rrweb-player replay.
- AI issue markers on the playback timeline.
- AI session summary.
- Friction score.
- Goal completion.
- Linked issue groups.

### `/settings`

- GitHub OAuth connect flow.
- Project settings.
- SDK install instructions.
- Environment and release setup.
- Auto-raise configuration: enable/disable, severity threshold (P0 only or P0+P1), and confidence threshold.
- AI follow-up comment configuration: enable/disable per project.

---

## Explicit Out of Scope (MVP)

- Heatmaps.
- Product analytics.
- A/B testing.
- Core Web Vitals monitoring.
- Auto-fix PRs or draft branch creation.
- Slack or WhatsApp alerts.
- Mobile SDKs.
- Team assignments and collaboration workflows.
- Billing.
- Self-hosting.
- Custom AI prompt configuration.
- Full observability replacement.

---

## Success Criteria for MVP

- SDK records a real session end-to-end without breaking the host app.
- Completed non-noise sessions receive AI triage.
- Repeated failures cluster into a single issue group.
- At least one issue group produces a specific, useful root cause and suggested fix.
- A GitHub issue can be raised from an issue group with replay evidence and reproduction steps.
- Full demo loop can be completed in under 5 minutes.

---

## What We Are Not Trying To Prove Yet

- Enterprise privacy compliance.
- Long-term AI accuracy benchmarks.
- Pricing model.
- Scale beyond early MVP traffic.
- Replacing Sentry, LogRocket, PostHog, or product analytics tools.
- Automated code fixes.

Vigil's MVP only needs to prove that AI can turn real user sessions into fewer, clearer, more actionable bug reports than a developer would get by manually watching replays.
