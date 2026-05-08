# Vigil

AI-first bug triage from real user sessions. Vigil watches your users, groups repeated failures, and turns them into developer-ready GitHub issues — automatically.

---

## What It Does

Vigil is not a session replay tool. Replay is evidence. The product is the triage loop:

- **Detects** broken UX from real sessions — JS errors, network failures, rage clicks, dead clicks, navigation friction.
- **Groups** repeated failures across sessions into a single issue. 500 users hitting the same bug → 1 issue, not 500 reports.
- **Writes** developer-ready bug reports: root cause, reproduction steps, suggested fix, severity, and supporting evidence.
- **Raises** GitHub issues pre-filled by AI, one per issue group, with optional auto-raise for high-confidence P0/P1s.

## How It Works

1. **Record** — install `@vigil/sdk`. Captures DOM mutations, clicks, scrolls, masked inputs, console errors, JS exceptions, network failures, and navigations using rrweb. No raw input values leave the browser.
2. **Ingest** — events are batched and flushed to Vigil's ingest API. Sessions are processed asynchronously and non-noise sessions enter the triage pipeline automatically.
3. **Triage** — the AI makes a verdict on every session: normal behavior, a new bug, or a duplicate of a known failure. Repeated failures cluster into a single issue group — not one report per affected user.
4. **Act** — developers work from a prioritized issue queue, not a list of sessions. Each issue comes with AI-written root cause, reproduction steps, a suggested fix, and a one-click path to a pre-filled GitHub issue.

## Stack

| Layer | Choice |
|---|---|
| SDK | TypeScript + rrweb |
| Backend | Node.js + Hono |
| Frontend | Next.js |
| Database | SQLite (dev) → Postgres (prod) |
| Blob storage | Local disk (dev) → R2/S3 (prod) |
| AI | Claude API |
| GitHub | Octokit |

## Docs

- [Product Spec](docs/vigil-product-spec.md)
- [System Architecture](docs/vigil-architecture.md)
- [Data Schema](docs/vigil-data-schema.md)
- [SDK Contract](docs/vigil-sdk-contract.md)
