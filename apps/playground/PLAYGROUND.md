# Vigil SDK Internal Playground

This is a minimal, framework-independent playground for manually validating the behavior of the Vigil SDK within a real browser environment.

## Purpose

While automated unit tests (via Vitest) handle payload structuring and synchronous logic verification, they cannot reliably simulate complex browser lifecycles such as:
- `visibilitychange` behavior on mobile/desktop
- `pagehide` and bfcache navigation
- Asynchronous error bubbling (`window.onerror`, `unhandledrejection`)
- Native DOM mutation captures (rrweb)

This playground provides a deterministic sandbox to test these behaviors manually during development.

## How to Run

From the root of the monorepo, run:

```bash
pnpm --filter @vigil/playground dev
```

This will start the Vite dev server (typically on `http://localhost:3000`).

## Available Features

### Status Panel
Displays the internal state of the SDK instance by loosely reading `window.__vigil`. It tracks the Session ID, queue sizes, and lifecycle status (e.g., if a final flush was sent).

### Signal Triggers
Provides buttons to deterministically trigger specific SDK detectors:
- **Errors/Warnings**: Throws JS errors, unhandled rejections, and invokes console methods.
- **Clicks**: Simulates rapid consecutive clicks for Rage Clicks.
- **Navigation**: Simulates an SPA navigation event via `history.pushState`.
- **Lifecycle Flushes**: Manually dispatches `visibilitychange` or `pagehide` to observe transport behavior.

### Transport Log
Intercepts outgoing `fetch` and `sendBeacon` requests to the mock ingest endpoint and logs their summaries (event count, summary count, and whether the payload is marked as `isFinal`).

## Known Limitations

- **No Backend**: The playground uses a mock local endpoint. No data is actually ingested or processed.
- **No Replay Playback**: It validates that rrweb *captures* data (via DOM mutation testing and queue sizes), but it does not include a replay visualizer.
- **No Automated E2E**: This is strictly for manual debugging and regression testing.

## Explicitly Out of Scope
- Full E2E framework integration (Playwright, Cypress).
- Heavy analytics dashboards.
- Complex UI frameworks (React, Vue) — this is built with Vanilla TS to keep it fast and isolated.
