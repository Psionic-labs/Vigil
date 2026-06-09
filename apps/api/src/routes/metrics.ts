/**
 * @file metrics.ts
 * @description Exposes system and pipeline latency statistics and count metrics.
 * @why Feeds dashboard statistics or Prometheus scraping scripts.
 */


import { Hono, type Context } from "hono";
import { globalLimiterStore, globalProjectCache } from "../lib/rate-limit-store";
import type { AppEnv } from "../lib/types";
// Import the global database pool client to execute queue metrics aggregation queries.
import { pool } from "../db";

export const metricsRouter = new Hono<AppEnv>();

// The route handler is made asynchronous to support awaiting the queue metrics database query execution.
metricsRouter.get("/", async (c: Context<AppEnv>) => {
  // Verify if metrics collection is globally enabled.
  if (process.env.ENABLE_INTERNAL_METRICS !== "true") {
    return c.json(
      {
        ok: false,
        success: false,
        error: {
          message: "Metrics endpoint disabled",
          code: 403,
        },
      },
      403
    );
  }

  // Authentication check: enforced in non-development environments or whenever INTERNAL_METRICS_TOKEN is configured (even in development).
  const expectedToken = process.env.INTERNAL_METRICS_TOKEN;
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!isDevelopment || expectedToken) {
    if (!expectedToken) {
      console.warn("[Metrics] INTERNAL_METRICS_TOKEN is not configured in non-development environment.");
      return c.json(
        {
          ok: false,
          success: false,
          error: {
            message: "Unauthorized: INTERNAL_METRICS_TOKEN is not configured",
            code: 401,
          },
        },
        401
      );
    }

    const authHeader = c.req.header("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token !== expectedToken) {
      return c.json(
        {
          ok: false,
          success: false,
          error: {
            message: "Unauthorized",
            code: 401,
          },
        },
        401
      );
    }
  }

  // Retrieve current in-memory sizes and memory estimation of the rate limiters.
  const sizes = globalLimiterStore.getSizes();
  const memoryBytes = globalLimiterStore.getEstimatedMemoryUsageBytes();

  // Initialize queue metrics default structure (returns zeros if DB is unavailable or queue is empty).
  let queueMetrics = {
    depth: 0,
    oldestJobAgeMs: 0,
    leasedJobs: 0,
    deadLetterJobs: 0,
    retries: 0,
    completedJobs: 0,
  };

  try {
    const now = Date.now();
    let maxAttempts = parseInt(process.env.TRIAGE_MAX_ATTEMPTS || "3", 10);
    if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
      maxAttempts = 3;
    }
    let leaseTimeoutMs = parseInt(process.env.TRIAGE_LEASE_TIMEOUT_MS || "300000", 10);
    if (!Number.isInteger(leaseTimeoutMs) || leaseTimeoutMs <= 0) {
      leaseTimeoutMs = 300000;
    }
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    // Execute a single aggregated query to calculate all triage queue metrics in PostgreSQL.
    // Using a single query with FILTER clauses prevents multi-query connection overhead,
    // and constraining to non-completed or recent completed jobs avoids scanning full table history.
    const dbRes = await pool.query(
      `
      SELECT
        -- queue_depth: pending/failed retryable jobs that are currently due, or stale leased jobs reclaimable by worker.
        COUNT(*) FILTER (WHERE (status IN ('pending', 'failed') AND attempts < $2 AND next_attempt_at <= $1) OR (status = 'leased' AND locked_at < $3)) AS queue_depth,
        -- oldest_job_age_ms: maximum delay duration since the oldest eligible pending/failed or stale leased job was created.
        COALESCE(MAX(CASE WHEN (status IN ('pending', 'failed') AND attempts < $2 AND next_attempt_at <= $1) OR (status = 'leased' AND locked_at < $3) THEN $1 - created_at ELSE 0 END), 0) AS oldest_job_age_ms,
        -- jobs_leased: active jobs currently leased/locked by active workers.
        COUNT(*) FILTER (WHERE status = 'leased') AS jobs_leased,
        -- jobs_dead_letter: jobs permanently failed or exceeding maximum attempts limits.
        COUNT(*) FILTER (WHERE status = 'dead_letter') AS jobs_dead_letter,
        -- jobs_retried: cumulative sum of retries across all jobs (first attempt is not a retry).
        COALESCE(SUM(GREATEST(attempts - 1, 0)), 0) AS jobs_retried,
        -- jobs_completed: total successfully triaged and persisted session jobs.
        COUNT(*) FILTER (WHERE status = 'completed') AS jobs_completed
      FROM triage_jobs
      WHERE status != 'completed' OR created_at >= $4
      `,
      [now, maxAttempts, now - leaseTimeoutMs, oneDayAgo]
    );

    const row = dbRes.rows[0];
    if (row) {
      // Parse database string outcomes into integers.
      queueMetrics = {
        depth: parseInt(row.queue_depth || "0", 10),
        oldestJobAgeMs: parseInt(row.oldest_job_age_ms || "0", 10),
        leasedJobs: parseInt(row.jobs_leased || "0", 10),
        deadLetterJobs: parseInt(row.jobs_dead_letter || "0", 10),
        retries: parseInt(row.jobs_retried || "0", 10),
        completedJobs: parseInt(row.jobs_completed || "0", 10),
      };
    }
  } catch (err) {
    // If the database query fails, log the exception to stderr but DO NOT crash the API.
    // The endpoint returns a fallback zeroed structure to guarantee monitoring scraper availability.
    console.error("[Metrics] Failed to fetch triage queue metrics:", err);
  }

  return c.json({
    ok: true,
    success: true,
    metrics: {
      // Rate limiter metrics
      ipLimitedCount: globalLimiterStore.ipLimitedHits,
      projectLimitedCount: globalLimiterStore.projectLimitedHits,
      sessionLimitedCount: globalLimiterStore.sessionLimitedHits,
      activeBuckets: {
        ip: sizes.ip,
        project: sizes.project,
        session: sizes.session,
        total: sizes.ip + sizes.project + sizes.session,
      },
      memoryUsageEstimateBytes: memoryBytes,
      cache: {
        hits: globalProjectCache.hits,
        misses: globalProjectCache.misses,
        size: globalProjectCache.getCacheSize(),
      },
      cardinalityEvictions: globalLimiterStore.cardinalityEvictions,
      // Flat triage queue metrics (ideal for Prometheus parsing)
      triage_queue_depth: queueMetrics.depth,
      triage_oldest_job_age_ms: queueMetrics.oldestJobAgeMs,
      triage_jobs_leased: queueMetrics.leasedJobs,
      triage_jobs_dead_letter: queueMetrics.deadLetterJobs,
      triage_jobs_retried: queueMetrics.retries,
      triage_jobs_completed: queueMetrics.completedJobs,
      // Nested triage queue metrics block
      queue: queueMetrics,
    },
  });
});
