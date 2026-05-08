# Vigil — SDK Contract

> This defines exactly what the SDK sends, how it behaves, and what the ingest API must accept. Once shipped, this interface is frozen until v2.

---

## SDK Initialization

```html
<script src="https://cdn.usevigilhq.com/sdk/v1/vigil.min.js"></script>
<script>
  Vigil.init({
    projectKey: "pk_live_xxxxxxxxxxxx",
    maskAllInputs: true,
    endpoint: "https://ingest.usevigilhq.com/api/ingest",
    flushInterval: 5000,
    sessionSampleRate: 1.0,
    environment: "production",
    release: "web-2026.05.08",
    commitSha: "a81f9d"
  });
</script>
```

```bash
npm install @vigil/sdk
```

```typescript
import { Vigil } from "@vigil/sdk";

Vigil.init({
  projectKey: "pk_live_xxxxxxxxxxxx",
  maskAllInputs: true,
  environment: "production",
  release: "web-2026.05.08",
  commitSha: "a81f9d",
});
```

---

## Init Options

```typescript
type VigilInitOptions = {
  projectKey: string;
  maskAllInputs?: boolean;
  endpoint?: string;
  flushInterval?: number;
  sessionSampleRate?: number;
  environment?: "development" | "preview" | "production";
  release?: string;
  commitSha?: string;
  userId?: string;
};
```

Defaults:

- `maskAllInputs: true`
- `endpoint: "https://ingest.usevigilhq.com/api/ingest"`
- `flushInterval: 5000`
- `sessionSampleRate: 1.0`

`release`, `commitSha`, and `environment` are optional but strongly recommended. They allow Vigil to identify regressions and correlate issue groups with deploys.

If `userId` is provided, the SDK or backend must hash it before persistent storage. It is used only to estimate user impact and should not be displayed as raw PII.

---

## What The SDK Captures

| Signal | How | Default |
|---|---|---|
| DOM mutations, clicks, scroll | rrweb core | On |
| Input values | rrweb masking | Masked |
| JS exceptions | `window.onerror` and `window.onunhandledrejection` | On |
| Console errors | `console.error` monkey patch | On |
| Network failures | `fetch` and `XMLHttpRequest` interceptors | 4xx and 5xx only |
| Network method | Same interceptors | On |
| Rage clicks | 3+ clicks in same 500px area within 2s | On |
| Dead clicks | Click with no DOM mutation or navigation within 500ms | On |
| Page navigations | `pushState`, `replaceState`, `popstate` | On |
| Release metadata | Init options | Optional |

---

## What Is Never Captured

- Password values.
- Cross-origin iframe contents.
- File contents from `input[type=file]`.
- WebSocket message bodies.
- Raw localStorage or sessionStorage contents.
- Authorization headers.
- Request or response bodies by default.

`input[type=password]` is always masked, with no opt-out.

---

## Session Lifecycle

```text
Vigil.init()
  -> sample session based on sessionSampleRate
  -> generate or reuse sessionId from sessionStorage
  -> start rrweb recording
  -> attach signal hooks
  -> start flush timer

Every flushInterval
  -> collect buffered rrweb events
  -> collect buffered summary events
  -> POST to ingest endpoint
  -> clear successfully sent buffers

On beforeunload/pagehide
  -> final flush with isFinal: true
  -> use navigator.sendBeacon when available
```

Session ID persistence:

- Stored in `sessionStorage`.
- Survives SPA route changes.
- Does not survive new tabs or new browser sessions.

The sessionStorage key is frozen for v1:

```text
vigil_session_id
```

---

## Ingest API Contract

Endpoint:

```text
POST https://ingest.usevigilhq.com/api/ingest
Content-Type: application/json
```

No auth header. `projectKey` in the body authenticates ingest.

---

## Request Body

```typescript
type IngestPayload = {
  sessionId: string;
  projectKey: string;
  events: object[];
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
  environment?: "development" | "preview" | "production";
  release?: string;
  commitSha?: string;
  userId?: string;
};

type SummaryEvent = {
  type: SummaryEventType;
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

type SummaryEventType =
  | "js_error"
  | "rage_click"
  | "dead_click"
  | "network_error"
  | "navigation"
  | "console_error";
```

Raw rrweb events are opaque to the backend and stored as replay blobs. Summary events are validated, normalized, and used as AI triage input.

---

## Response

```typescript
// 200 OK
{ "ok": true }

// 400 Bad Request
{ "ok": false, "error": "invalid_payload", "detail": "..." }

// 401 Unauthorized
{ "ok": false, "error": "invalid_project_key" }

// 413 Payload Too Large
{ "ok": false, "error": "payload_too_large" }
```

`200 OK` means the batch was accepted for storage and async processing. It does not mean AI triage has completed.

---

## Backend Validation Rules

- `projectKey` must exist in `projects.public_key`.
- `sessionId` must be a non-empty string, max 64 chars.
- `events` max 500 items per flush.
- `summary` max 50 items per flush.
- Payload max size is 2MB per flush.
- All string fields are trimmed and truncated, not rejected unless the top-level shape is invalid.
- `timestampMs` must be a non-negative integer.
- `networkMethod` must be one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`; unknown methods are dropped from the event.
- `environment` must be `development`, `preview`, or `production` when present.
- `release` max 100 chars.
- `commitSha` max 64 chars.
- `userId` max 200 chars before hashing.
- `isFinal: true` sets `sessions.ended_at` and queues AI triage unless skip conditions apply.

Skip AI triage when:

- session duration is under 5 seconds;
- there are zero summary events;
- raw replay blob storage failed.

---

## Summary Event Field Limits

| Field | Max |
|---|---:|
| `target` | 200 chars |
| `errorMessage` | 500 chars |
| `errorStack` | 2000 chars |
| `networkUrl` | 500 chars |
| `networkMethod` | 10 chars |
| `navTo` | 500 chars |

The backend may store normalized versions for fingerprinting.

---

## Client-Side Signal Detection

### Rage Click

Detected when the user clicks 3 or more times in the same 500px area within 2 seconds.

Summary event:

```json
{
  "type": "rage_click",
  "timestampMs": 12500,
  "target": "#pay-btn",
  "clickCount": 4
}
```

### Dead Click

Detected when a click is followed by no DOM mutation, no navigation, and no relevant network activity within 500ms.

Summary event:

```json
{
  "type": "dead_click",
  "timestampMs": 8300,
  "target": "#continue"
}
```

### Network Failure

Detected for HTTP 4xx and 5xx responses.

Summary event:

```json
{
  "type": "network_error",
  "timestampMs": 12450,
  "networkUrl": "/api/payment",
  "networkStatus": 500,
  "networkMethod": "POST"
}
```

### JS Error

Detected via global error handlers.

Summary event:

```json
{
  "type": "js_error",
  "timestampMs": 12510,
  "errorMessage": "TypeError: Cannot read properties of undefined",
  "errorStack": "..."
}
```

---

## SDK Error Handling

- SDK internals must never throw uncaught exceptions into the host page.
- If ingest is unreachable, keep events in memory and retry on the next flush.
- Retry normal flushes up to 3 times, then drop silently.
- Use `navigator.sendBeacon` for unload flushes when available.
- Fall back to `fetch` with `keepalive` for unload where supported.
- Never block page load.
- Avoid host app performance degradation.
- Use rrweb checkout settings to prevent memory bloat on long sessions.

---

## SDK Size Budget

- Gzipped bundle under 25KB.
- No heavy dependencies beyond rrweb recording.
- Import only the recording path, not rrweb replay.

---

## What The SDK Does Not Do

The SDK is a collector, not the triage agent.

It does not:

- Call AI.
- Decide whether a session is a bug.
- Group issues.
- Show UI in the host page.
- Modify the host DOM beyond what rrweb requires.
- Read source maps.
- Inspect app source code.

All AI triage happens server-side after ingest.

---

## Versioning

- SDK version is embedded in every ingest payload as `sdkVersion`.
- Backend stores `sdk_version` on the session.
- Breaking changes require a new major SDK version and endpoint path: `/api/v2/ingest`.

Frozen for v1:

- `IngestPayload` top-level field names.
- `SummaryEventType` enum values.
- Response shape.
- Endpoint path `/api/ingest`.
- Session storage key `vigil_session_id`.

Patch-changeable:

- Default flush interval.
- Retry count.
- Rage click threshold.
- Dead click timing.
- Internal batching strategy.
