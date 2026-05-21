# High Priority Future Improvements (deferred for now)

## 1. Replay/Event Chunking

Current risk:
large replay payloads can:

* exceed beacon limits
* spike memory
* fail serialization

Add:

* chunked replay transport
* max payload sizing
* adaptive splitting

Example:

```ts id="z7wbvk"
MAX_PAYLOAD_BYTES
MAX_REPLAY_EVENTS_PER_BATCH
```

Very important for production scale.

---

## 2. Event IDs + Backend Deduplication

Right now visibility snapshots can duplicate events.

Add:

* stable event IDs
* monotonic counters
* UUIDs
* session sequence numbers

Backend can then:

* deduplicate visibility snapshots
* safely merge partial batches

Very valuable.

---

## 3. Compression

Replay payloads become huge quickly.

Add:

* gzip
* brotli
* rrweb compression
* structural deduplication

Especially important for:

* mobile
* slow networks
* replay-heavy sessions

---

## 4. Adaptive Sampling

Current sampling is static.

Eventually:

* dynamic replay sampling
* error-triggered replay escalation
* rage-click-triggered replay preservation

Example:

```txt id="jx2csi"
normal session => summary only
error detected => enable replay
```

Huge cost reduction.

---

## 5. Offline Queue Persistence

Currently:
browser crash/network failure can still lose telemetry.

Add:

* IndexedDB persistence
* localStorage fallback
* replay queue recovery

Especially useful for:

* flaky mobile connections
* PWAs
* offline-first apps

---

## 6. Cross-Tab Coordination

Multiple tabs currently behave independently.

Add:

* BroadcastChannel
* leader election
* shared session coordination

Prevents:

* duplicate replay streams
* inconsistent sessions
* excessive network usage

---

## 7. Transport Backpressure

Currently queues are bounded, but transport is not adaptive.

Add:

* dynamic flush intervals
* congestion detection
* queue pressure heuristics

Example:

```txt id="9rm14h"
large queue => flush faster
network failing => flush slower
```

---

## 8. Payload Schema Versioning

Eventually required.

Add:

```ts id="hwp4e7"
schemaVersion
```

inside payloads.

Critical once:

* backend evolves
* replay format changes
* ingestion compatibility matters

---

## 9. Better Lifecycle State Machine

Currently:
booleans + epoch.

Eventually:

```ts id="9n0op9"
"idle"
"initializing"
"running"
"finalizing"
"shutdown"
"destroyed"
```

This becomes useful once:

* async init exists
* plugins exist
* transports diversify

Not urgent yet.

---

# Medium Priority Improvements

## 10. MutationObserver Optimization

rrweb can get expensive on huge DOMs.

Add:

* subtree filtering
* mutation throttling
* ignored selectors
* replay exclusion regions

Important for:

* dashboards
* editors
* huge SPAs

---

## 11. Visibility Snapshot Limits

Current snapshots clone everything.

Eventually:

* capped snapshot sizes
* summary-only hidden flushes
* replay truncation on mobile

Prevents memory spikes.

---

## 12. Incremental Replay Streaming

Currently replay is batch-based.

Future:

* rolling replay streaming
* partial replay uploads
* resumable replay chunks

Much better scalability.

---

## 13. Better Mobile Lifecycle Handling

Mobile lifecycle APIs are messy.

Potential additions:

* `freeze`
* `resume`
* Page Lifecycle API
* background sync

Especially useful on Android Chrome.

---

## 14. Intelligent Retry Policies

Current retries are simple.

Future:

* exponential backoff
* jitter
* retry classification
* network-aware retries

---

## 15. Rate Limiting / Circuit Breaking

Protect backend + client.

Add:

* max requests/minute
* replay suppression under stress
* endpoint failure circuit breaker

---

# Lower Priority / Advanced Features

## 16. Privacy Controls

Eventually critical.

Add:

* DOM masking
* input redaction
* selector blacklists
* PII filtering

Absolutely required before public production usage.

---

## 17. Plugin System

Eventually:

```ts id="3gvh8m"
plugins: []
```

for:

* custom detectors
* custom transports
* framework integrations

Only after core stabilizes.

---

## 18. Framework Integrations

Future packages:

* React
* Next.js
* Vue
* Svelte

With:

* route awareness
* hydration awareness
* error boundaries

---

## 19. Worker Offloading

Heavy serialization/compression could move to:

* Web Workers
* Shared Workers

Important at scale.

---

## 20. Session Recovery Semantics

Future:

* crash recovery
* partial replay stitching
* orphaned session recovery

Advanced observability territory.

---

# Most Important Near-Term Priorities

If prioritizing realistically:

## P0

1. event IDs + dedup
2. replay chunking
3. compression
4. privacy masking
5. offline persistence

## P1

6. adaptive sampling
7. backpressure
8. intelligent retries
9. cross-tab coordination

## P2

10. plugin system
11. worker offloading
12. advanced lifecycle APIs

---

# Biggest Missing Production Concern Right Now

Honestly:

```txt id="ofc8fh"
privacy + payload sizing
```

Those become critical BEFORE:

* scaling traffic
* public release
* real replay adoption

Especially:

* input masking
* secret stripping
* replay chunk limits
* large DOM handling

Those are the next major frontier.
