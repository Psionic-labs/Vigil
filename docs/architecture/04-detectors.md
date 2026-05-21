# Detectors

Detectors (`src/detectors/` and `src/errors.ts`) are modular, independent observers that monitor the browser environment for specific behavioral signals. They map user frustrations, navigation changes, and code errors into lightweight JSON structures called `SummaryEvent`s.

Unlike `rrweb` DOM snapshots (which are heavy and continuously streamed), summary events are discreet and high-value.

## Detector Responsibilities

Every detector in the Vigil SDK adheres to a strict contract:
1. **Purity of State**: Detectors may only `push` into `state.summaryEvents`. They cannot flush the queue, clear it, or interact with the network transport.
2. **Guaranteed Teardown**: The initialization function of every detector (e.g., `setupRageClickCapture`) MUST return a parameterless cleanup function `() => void` that fully removes all event listeners, un-patches globals, and clears timers.
3. **Passive Listeners**: Whenever attaching to high-frequency DOM events (`click`, `scroll`), detectors must use `{ passive: true, capture: true }` to ensure they never degrade the scrolling performance of the host application.

## 1. Click Detectors

### Rage Clicks (`rage-click-detector.ts`)
* **Logic**: Detects when a user clicks rapidly within a confined area (e.g., 3+ clicks within 500px radius in 2 seconds). 
* **Implementation Details**: Uses a sliding window array to track recent click coordinates and timestamps.

### Dead Clicks (`dead-click-detector.ts`)
* **Logic**: Detects when a user clicks on the page, but the application fails to respond visually within 500ms.
* **Implementation Details**: Upon `mousedown`, a timer is started. Concurrently, a temporary `MutationObserver` is booted. If the DOM mutates before the 500ms timer expires, the click is deemed "alive" and discarded. If the timer fires and no mutations occurred, a dead click event is pushed.

### Significant Clicks (`significant-click-detector.ts`)
* **Logic**: Tracks intentful navigation or action inputs. 
* **Implementation Details**: Filters the global click stream for specific tags (`<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`) or elements bearing `role="button"`. 

## 2. Navigation Tracking (`navigation-observer.ts`)

Single Page Applications (SPAs) do not trigger full page loads when changing routes. The navigation observer ensures we capture these virtual route transitions.
* **Implementation Details**: 
  * Listens to the native `popstate` event.
  * Monkey-patches `history.pushState` and `history.replaceState`.
* **Important Invariant**: When monkey-patching global browser APIs, the SDK must store a reference to the original, unmodified function and restore it perfectly during the teardown sequence. Failing to do so causes infinite loops if the SDK is restarted during HMR.

## 3. Error Tracking (`errors.ts`)

The error module hooks into the browser's global exception handlers.
* **`window.onerror`**: Captures unhandled synchronous JavaScript exceptions.
* **`window.onunhandledrejection`**: Captures asynchronous Promise rejections.
* **Tradeoffs**: The SDK currently captures the error message, file, and line number. It does not attempt to parse source maps client-side or capture full deep stack traces recursively, as that would massively inflate the payload size.

## 4. Console Capture (`console.ts`)

Captures explicit console logging.
* **Logic**: Monkey-patches `console.error` and `console.warn` (configurable).
* **Implementation Details**: Wraps the original console methods, extracts the arguments, serializes them safely (handling cyclical references to prevent JSON.stringify crashes), and then calls the original browser console method so the developer's debugging experience is unaltered.

## Adding a New Detector

To add a new detector to the SDK:
1. Create `src/detectors/my-new-detector.ts`.
2. Define `setupMyNewDetector(ctx: { summaryEvents: SummaryEvent[] }): () => void`.
3. Add the setup call to `src/client/vigil-client.ts`.
4. Ensure the cleanup callback is pushed to the `lifecycle` manager.
5. Add the new event type string to the `SummaryEvent` discriminated union in `src/types.ts`.
