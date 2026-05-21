# Playground & Debug Tooling

Validating browser lifecycle APIs—such as `pagehide`, `visibilitychange`, and back-forward cache navigations—is notoriously difficult in synthetic testing environments (like JSDOM or Vitest). Real browsers behave idiosyncratically when freezing tabs or unloading documents.

To solve this, the repository includes an internal validation environment located at `apps/playground/`.

## Architecture of the Playground

The Playground is built as a pure, lightweight Vite app using vanilla TypeScript and minimal HTML. 

### Why No Framework?
We intentionally avoid wrapping the playground in React, Vue, or Next.js.
* Frameworks abstract away native DOM APIs and implement their own synthetic event systems (like React's SyntheticEvent).
* The SDK operates at the raw browser level (monkey-patching `history.pushState`, intercepting raw `MouseEvent`s).
* To accurately test that the SDK is capturing events properly, the host environment must be as "close to the metal" as possible. Framework complexity would only introduce confounding variables during debugging.

## Transport Interception

A primary requirement of the Playground is that engineers must be able to validate network payloads *without* running a backend ingest server.

To achieve this, the playground overrides the browser's networking primitives directly in `main.ts` before they are utilized by the SDK.

### 1. `fetch` Mocking
The playground overrides `window.fetch`. When the SDK performs a Periodic Flush or Visibility Flush:
* The mocked fetch intercepts the request destined for `/api/ingest`.
* It parses the JSON payload.
* It prints the payload to a visual "Transport Log" on the screen.
* It returns a synthetic `200 OK` Response so the SDK's retry semantics assume the flush was successful.

### 2. `navigator.sendBeacon` Mocking
Similarly, the playground overrides `navigator.sendBeacon`. When the SDK performs a Final Flush on `pagehide`:
* The mocked beacon intercepts the blob.
* It updates the on-screen UI immediately (or logs to the console, since the page might be dying).

## The State Panel

The Playground includes a live diagnostic panel that polls the global `(window as any).__vigil` debug object.
It safely polls via `setInterval` to display:
* The current `sessionId`.
* The `lifecycleEpoch`.
* The `finalFlushSent` boolean.
* The length of the internal event queues.

**Important Note on Polling Mutations**: When building or testing features like the Dead Click Detector (which relies on `MutationObserver` to ensure the DOM is quiet), we explicitly ensure that the State Panel's polling loop *does not* mutate the DOM unless the text has actually changed. Unnecessary DOM replacement in a `setInterval` loop would trick the SDK into thinking the page was reacting to user input, thereby canceling dead clicks falsely.
