# Replay System (`rrweb`)

The Replay System is responsible for capturing full DOM snapshots and streaming incremental mutations, allowing developers to visually reproduce a user's session exactly as they experienced it. The SDK utilizes the open-source `rrweb` library for this capability.

## `rrweb` Integration Boundaries

Because `rrweb` is highly complex and operates autonomously, the SDK treats it as a black box. Our integration boundaries are limited to:
1. **Bootstrapping**: Calling `record()` and supplying configuration options.
2. **Buffer Ingestion**: Providing an `emit()` callback where `rrweb` pushes its snapshots.
3. **Shutdown**: Calling the stop callback returned by `record()` when the SDK is torn down.

## Buffering Semantics & Memory Limits

`rrweb` events are pushed directly into `state.events`.
Because a user might leave a tab open for hours, or the network transport might fail, the SDK enforces a strict memory limit on the event buffer to prevent the browser tab from crashing due to OOM (Out Of Memory) errors.

### The `MAX_EVENTS` Truncation Rule
```typescript
const MAX_EVENTS = 2000;
```
If `state.events.length` exceeds `MAX_EVENTS`, the SDK enforces a **lossy truncation**:
* We splice the array and drop the oldest elements to make room for new ones.
* **Tradeoff**: While this prevents a memory crash, it means the recorded replay will be missing the earliest context. The ingested session will look like it "started in the middle." We prioritize the browser's stability over perfect replay completeness.

## Privacy & Masking

Session replays carry a high risk of accidentally exfiltrating Personally Identifiable Information (PII), passwords, or financial data.
* **`maskAllInputs`**: By default, this is set to `true`. This instructs `rrweb` to mask all text typed into `<input>` fields. It replaces characters with asterisks (`***`).
* **`maskTextClass`**: The SDK honors the `vigil-mask` CSS class. If a developer adds this class to any HTML element (e.g., `<div class="vigil-mask">John Doe</div>`), `rrweb` will redact the text content within that subtree.

## Architectural Tradeoffs & Limitations

### 1. Bundle Dominance
As documented in the bundle size audits, `rrweb`'s snapshot engine and mutation observers account for over **85%** of the SDK's total payload size. 

* **Why we accept this**: High-fidelity replay is the primary value proposition of the product.
* **Future considerations**: We may implement dynamic `import('rrweb')` to defer downloading the 25KB+ snapshotting engine until after the host application has finished rendering its critical path.

### 2. Tree-Shaking Limitations
While `esbuild` correctly strips out the `rrweb` Replayer/Player UI components (since we only import the `record` function), `rrweb` dynamically registers several heavy sub-observers internally:
* WebGL / Canvas recording workers
* Iframe managers
* Shadow DOM interceptors

Currently, there is no clean way to statically tree-shake these out of `rrweb` 2.x via import statements. The SDK bundles them unconditionally to ensure broad compatibility.
