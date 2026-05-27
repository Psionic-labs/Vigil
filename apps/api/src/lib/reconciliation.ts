/**
 * @file reconciliation.ts
 * @description In-process session timeout reconciliation worker.
 * @how Periodically identifies inactive, unfinalized sessions and transitionally marks them as abandoned.
 * @why Resolves permanently unfinalized sessions caused by browser crashes, mobile app suspensions, and process termination.
 */
import { pool } from "../db";

let reconciliationInterval: NodeJS.Timeout | null = null;
let jitterTimeout: NodeJS.Timeout | null = null;
let isReconciling = false;

const MIN_SESSION_TIMEOUT_MS = 10_000;
const MIN_RECONCILIATION_INTERVAL_MS = 1_000;
const DEFAULT_RECONCILIATION_INTERVAL_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function sanitizeTimeoutMs(timeoutMs: number): number {
  return Number.isFinite(timeoutMs)
    ? Math.min(Math.max(Math.trunc(timeoutMs), MIN_SESSION_TIMEOUT_MS), Number.MAX_SAFE_INTEGER)
    : MIN_SESSION_TIMEOUT_MS;
}

function sanitizeIntervalMs(intervalMs: number, timeoutMs: number): number {
  const fallback = Math.min(DEFAULT_RECONCILIATION_INTERVAL_MS, timeoutMs);
  const finiteIntervalMs = Number.isFinite(intervalMs)
    ? Math.trunc(intervalMs)
    : fallback;

  return Math.min(
    Math.max(finiteIntervalMs, MIN_RECONCILIATION_INTERVAL_MS),
    timeoutMs,
    MAX_TIMER_DELAY_MS,
  );
}

export interface ReconciliationResult {
  scanned: number;
  reconciled: number;
  duration: number;
  oldestUnreconciledAgeMs: number;
}

/**
 * Atomic batch scan and update of abandoned sessions.
 * Highly defensive, monotonic-safe, and index-optimized.
 */
export async function reconcileAbandonedSessions(
  timeoutMs: number,
  nowMs?: number,
): Promise<ReconciliationResult> {
  const start = performance.now();
  const currentNow = nowMs ?? Date.now();
  const sanitizedTimeoutMs = sanitizeTimeoutMs(timeoutMs);

  // 1. Query scanned count and oldest un-reconciled session last_ingest_at timestamp
  const statsResult = await pool.query<{
    count: number;
    oldest_last_ingest_at: string | null;
  }>(
    `
    SELECT
      COUNT(*)::integer AS count,
      MIN(last_ingest_at)::bigint AS oldest_last_ingest_at
    FROM sessions
    WHERE ended_at IS NULL
      AND is_abandoned = false
    `,
  );

  const scanned = statsResult.rows[0]?.count ?? 0;
  const oldestLastIngest = statsResult.rows[0]?.oldest_last_ingest_at
    ? Number(statsResult.rows[0].oldest_last_ingest_at)
    : null;

  const oldestUnreconciledAgeMs = oldestLastIngest
    ? currentNow - oldestLastIngest
    : 0;

  // 2. Perform the atomic update using monotonic-safe duration_ms
  const updateResult = await pool.query(
    `
    UPDATE sessions
    SET
      is_abandoned = true,
      abandoned_at = $1,
      ended_at = last_ingest_at,
      duration_ms = LEAST(
        GREATEST(
          COALESCE(duration_ms, 0),
          GREATEST(last_ingest_at - started_at, 0)
        ),
        2147483647
      )::integer,
      updated_at = $1
    WHERE ended_at IS NULL
      AND is_abandoned = false
      AND ($1 - last_ingest_at) > $2
    RETURNING 1
    `,
    [currentNow, sanitizedTimeoutMs],
  );

  const reconciled = updateResult.rowCount ?? 0;
  const duration = performance.now() - start;

  return {
    scanned,
    reconciled,
    duration,
    oldestUnreconciledAgeMs,
  };
}

/**
 * Spawns the in-process reconciliation scheduler with startup jitter protection.
 */
export function startReconciliationWorker(
  intervalMs: number,
  timeoutMs: number,
): void {
  if (reconciliationInterval || jitterTimeout) {
    console.warn("[Reconciliation] Worker is already running.");
    return;
  }

  const sanitizedTimeoutMs = sanitizeTimeoutMs(timeoutMs);
  const sanitizedIntervalMs = sanitizeIntervalMs(intervalMs, sanitizedTimeoutMs);

  const run = async () => {
    if (isReconciling) return;
    isReconciling = true;
    try {
      const result = await reconcileAbandonedSessions(sanitizedTimeoutMs);
      console.info("[Reconciliation] Scan completed", {
        scanned: result.scanned,
        reconciled: result.reconciled,
        timeoutThresholdMs: sanitizedTimeoutMs,
        oldestUnreconciledAgeMs: result.oldestUnreconciledAgeMs,
        reconciliationDurationMs: result.duration.toFixed(2),
      });
    } catch (err) {
      console.error("[Reconciliation] Scan failed:", err);
    } finally {
      isReconciling = false;
    }
  };

  // Introduce random startup jitter (up to 5 seconds) to prevent DB connection spikes
  const startupJitterMs = Math.random() * 5000;

  console.log(
    `[Reconciliation] Worker starting with interval ${sanitizedIntervalMs}ms and timeout ${sanitizedTimeoutMs}ms (Jitter: ${startupJitterMs.toFixed(0)}ms)...`,
  );

  jitterTimeout = setTimeout(() => {
    jitterTimeout = null;
    // Run immediately after jitter
    run();
    // Schedule repeating intervals
    reconciliationInterval = setInterval(run, sanitizedIntervalMs);
  }, startupJitterMs);
}

/**
 * Clears active timers and stops the worker loop cleanly.
 */
export function stopReconciliationWorker(): void {
  if (jitterTimeout) {
    clearTimeout(jitterTimeout);
    jitterTimeout = null;
  }
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
  }
  console.log("[Reconciliation] Worker stopped.");
}
