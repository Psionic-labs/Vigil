# Session & State Management

The Vigil SDK requires a cohesive understanding of a "User Session" to stitch together disparate events (clicks, navigations, DOM mutations) and send them to the backend under a single identifier. 

## The `session.ts` Module

The session identifier (`sessionId`) is the primary key used by the ingest backend to route events to the correct blob storage.

### Persistence Strategy
The SDK relies on `sessionStorage` to persist the `sessionId`.
* **Why `sessionStorage` over `localStorage` or cookies?**
  A session in observability terms usually maps to a single tab's lifespan. If a user duplicates a tab, `sessionStorage` natively clones the storage to the new tab, allowing the session to branch or persist naturally without contaminating separate, unrelated browser windows. It also avoids privacy and cookie consent complications that arise from long-lived `localStorage` tracking.
* **Initialization**: When `Vigil.init()` boots, it checks `sessionStorage` for a `__vigil_session_id`. If one exists, it resumes the session. If not, it generates a fresh, cryptographically secure UUIDv4 and stores it.

## Sampling (`sampling/session-sampling.ts`)

Because high-fidelity DOM recording is expensive for both bandwidth and backend storage, the SDK implements client-side session sampling.

### The Mechanism
Configured via `Vigil.init({ sessionSampleRate: 0.1 })` (e.g., 10% sampling).
* Sampling is evaluated **once per session generation**.
* When a new `sessionId` is created, `Math.random()` is evaluated against the `sessionSampleRate`.
* If the session is dropped, we store a special marker (`__vigil_sampled_out`) in `sessionStorage` instead of a UUID.
* **Sticky Sampling**: This is a critical invariant. If a user refreshes the page, the SDK reads the `__vigil_sampled_out` marker and *immediately aborts initialization*. This prevents a user from repeatedly refreshing the page until they are randomly selected for sampling. The sampling decision must remain constant for the entire lifespan of that tab's session.

## Global State Container (`state.ts`)

Instead of passing variables deeply through closures, the SDK relies on a centralized mutable `state` object. This was an intentional architectural choice to simplify the unload/teardown sequence.

```typescript
export interface SDKState {
  events: RrwebEvent[];
  summaryEvents: SummaryEvent[];
  finalFlushSent: boolean;
  lifecycleEpoch: number;
}
```

### Purpose of `lifecycleEpoch`
Single-Page Applications (SPAs) frequently utilize Hot Module Replacement (HMR). During HMR, `Vigil.init()` might be called again without a full page reload.

To prevent the old SDK instance from executing asynchronous callbacks (like a delayed flush retry or a delayed DOM mutation) and pushing data into the *new* SDK instance's state, we use an epoch counter. 
1. When `cleanupAll()` is called, the old SDK is torn down.
2. When the new SDK boots, it increments the global `lifecycleEpoch`.
3. Asynchronous closures hold a reference to the epoch they were created in. Before they execute, they check `if (currentEpoch !== closureEpoch) return;`.

### Purpose of `finalFlushSent`
When `pagehide` fires, the SDK fires a terminal flush. Because `pagehide` does not guarantee the script context is destroyed immediately, subsequent events might still trigger (e.g., a trailing `mouseleave` or a delayed `fetch` response). 
`state.finalFlushSent` acts as a hard boundary. Detectors check this flag before pushing new events into the queue, ensuring we don't leak memory by buffering events that will never be flushed.
