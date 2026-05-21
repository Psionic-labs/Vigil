# Core Lifecycle & Initialization

The Vigil SDK utilizes a tightly controlled, synchronous initialization sequence. Given that the SDK is embedded into untrusted host applications, its lifecycle must be entirely self-contained, idempotent, and resilient against abrupt browser shutdowns.

## Purpose

The `src/client/` directory is responsible for booting the SDK, validating configuration, creating global state, and tearing down all observers if the SDK is stopped. 

The primary files involved are:
* `vigil-client.ts`: The main entry point containing `Vigil.init()`.
* `lifecycle.ts`: The cleanup and registration registry.
* `state.ts`: The centralized memory buffers for events.

## Initialization Sequence

When `Vigil.init()` is called, the SDK:
1. **Validates Configuration:** Ensures the `projectKey` and `endpoint` are provided.
2. **Bootstraps State:** Evaluates `sessionSampleRate` to determine if the current session should be tracked. If sampling drops the session, initialization safely aborts.
3. **Instantiates the State Object:** Creates the `state` singleton, resetting queues and flags (`finalFlushSent = false`).
4. **Registers Observers:** Invokes all detector setups (e.g., `setupDeadClickCapture()`, `setupErrorCapture()`). Each setup function must return a teardown/cleanup callback.
5. **Registers the Flush Timer:** Starts the `setInterval` loop for periodic transport.
6. **Registers the Cleanup Handlers:** Pushes all cleanup callbacks into the `lifecycle` manager.

## The `state.ts` Object

The SDK strictly avoids scattering state. All pending network payloads live in `state.ts`:

```typescript
export interface SDKState {
  events: RrwebEvent[];
  summaryEvents: SummaryEvent[];
  finalFlushSent: boolean;
  lifecycleEpoch: number;
}
```

* **`events`**: The queue for full DOM replay snapshots (from rrweb).
* **`summaryEvents`**: The queue for lightweight structured events (errors, rage clicks, etc.).
* **`finalFlushSent`**: A terminal marker. Once true, the state is sealed.
* **`lifecycleEpoch`**: An incrementing counter used to invalidate pending async tasks (like retries) if the SDK is restarted.

## Ownership Boundaries

* **Creation**: Only `vigil-client.ts` is allowed to instantiate and configure the `SDKState`.
* **Mutation**: Detectors push into the state queues. They are *never* allowed to clear or reset the queues.
* **Drainage**: Only the `flush` module is permitted to empty the `events` and `summaryEvents` arrays.

## Teardown & Idempotency

The SDK provides a shutdown mechanism (primarily for HMR or SPA soft-reloads):

* `lifecycle.cleanupAll()` iterates through every registered teardown callback (e.g., `removeEventListener` calls, `clearInterval` for the flush timer).
* If `Vigil.init()` is called multiple times, the SDK safely calls `cleanupAll()` on the previous instance before booting the new one. This prevents memory leaks and duplicated event listeners (commonly causing double-logging in development environments).

## Important Invariants

1. **Idempotent Shutdown**: Calling `cleanup()` twice must be perfectly safe and throw no errors.
2. **Synchronous Boot**: The initialization phase inside `Vigil.init()` must be fully synchronous to guarantee that no user interactions are missed between the script evaluating and the observers attaching.
3. **Sealed State post-teardown**: After `cleanupAll()` is executed, any lingering asynchronous callbacks (e.g., a `fetch` rejection or an `rrweb` worker message) must check the `lifecycleEpoch` and discard themselves if they belong to a dead lifecycle.
