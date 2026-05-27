# Flush & Transport Semantics

The Flush and Transport module (`src/flush/`) is the most critical component of the SDK's reliability. It is responsible for draining the local memory buffers and ensuring data reaches the ingest endpoint, even under hostile conditions (like the user abruptly closing the browser tab).

## The Three Flush Types

The SDK categorizes network flushes into three distinct semantics. Understanding the difference between these is essential for preventing data loss or unintentional data duplication.

### 1. Periodic Flushes (Destructive Drain)
Driven by `setInterval` (defaulting to every 5 seconds). 
* **Behavior**: It takes all current items in `state.events` and `state.summaryEvents` and moves them into a local payload object.
* **Ownership Transfer**: It **destructively** clears the `state` queues. The payload is now exclusively owned by the async `fetch` Promise.
* **Transport**: Uses standard `fetch()`.
* **Retries**: If the `fetch` fails (e.g., a 5xx error or a network drop), the transport layer will retry up to 3 times with exponential backoff. If it ultimately fails, the payload is silently dropped to prevent memory leaks.

### 2. Visibility Flushes (Opportunistic Snapshot)
Driven by the `visibilitychange` event when `document.visibilityState === 'hidden'`.
* **Behavior**: Mobile browsers (and modern desktop browsers) frequently freeze background tabs without firing `unload` events. To prevent data loss, the SDK flushes the queue the moment the tab is hidden.
* **Ownership Transfer**: It performs a **non-destructive snapshot**. It sends a copy of the current queues but *leaves the items in the queues*.
* **Tradeoff (Intentional Duplication)**: Why not drain the queues? Because if the `fetch` fails (or the browser throttles background network requests), the data would be lost. By keeping the data in the queue, we ensure that if the user returns to the tab, the next Periodic Flush will pick it up and successfully deliver it. We intentionally accept the possibility that the ingest backend will receive duplicate events. The backend deduplicates incoming summary events at the database layer using deterministic occurrence IDs, while raw replay event blobs are append-only and may duplicate under retries.

### 3. Final Flushes (Terminal Unwind)
Driven by `pagehide` or `beforeunload`.
* **Behavior**: The user is navigating away or closing the tab. The SDK must dispatch data immediately without blocking the main thread.
* **Ownership Transfer**: **Terminal Destructive**. It takes all items, clears the queues, and sets `state.finalFlushSent = true`.
* **Transport**: Uses `navigator.sendBeacon()`. `fetch` cannot be used reliably in unload handlers because the browser cancels pending asynchronous requests when the DOM is destroyed.
* **Retries**: None. `sendBeacon` operates in a fire-and-forget capacity managed by the browser's background networking process.

## Retry Suppression and Epoch Invalidation

When a Periodic Flush fails and enters its retry loop (e.g., waiting 2 seconds before retrying), the browser state might change:
1. **Terminal State**: If the user closes the tab during a retry wait, the Final Flush is triggered. The Final Flush sends the *current* state. When the retry timer wakes up, it checks `state.finalFlushSent`. If `true`, the retry is **suppressed** to avoid generating network traffic on a dead page.
2. **Epoch Invalidation**: If the host application manually calls `Vigil.init()` again (restarting the SDK), the `lifecycleEpoch` is incremented. Any active retry loops from the previous epoch will notice the epoch mismatch and cleanly self-terminate.

## Important Invariants

1. **At-Most-Once Finalization**: A Final Flush can only occur once per lifecycle epoch. Once `finalFlushSent` is `true`, all further enqueueing, flushing, and retrying is permanently disabled.
2. **Payload Size Limits**: Before transmission, the transport layer must strictly verify the stringified payload size against the 64KB `sendBeacon` limit. If it exceeds 64KB, the SDK must drop older events or `rrweb` snapshots to ensure the beacon doesn't fail silently.
3. **Keepalive Fallback**: If `sendBeacon` is unavailable or fails synchronously, the SDK must fallback to `fetch(url, { keepalive: true })`.
