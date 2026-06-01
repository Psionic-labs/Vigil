/**
 * @file triage-worker.ts
 * @description Master daemon polling loop that claims pending jobs via row-level locks,
 *              verifies configurations, and delegates executions to the triage runner.
 * @why Utilizing SKIP LOCKED allows multiple worker processes to safely poll the same table concurrently,
 *      achieving horizontal scalability without double-processing jobs or causing row-lock blocks.
 */

import os from "node:os";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { pool, withTransaction } from "../db";
import { processTriageJob } from "./triage-runner";

// Load local environment variables from .env on startup
dotenv.config();

// Standardize worker identity format: hostname:pid:uuid.
// Saved to triage_jobs.locked_by to enable tracing and ownership checks.
const hostname = os.hostname();
const pid = process.pid;
const uuid = crypto.randomBytes(4).toString("hex");
const workerId = `${hostname}:${pid}:${uuid}`;
process.env.WORKER_ID = workerId;

// Parse configuration variables with safe defaults.
const batchSize = parseInt(process.env.TRIAGE_BATCH_SIZE || "10", 10);
const pollIntervalMs = parseInt(process.env.TRIAGE_POLL_INTERVAL_MS || "10000", 10);
const leaseTimeoutMs = parseInt(process.env.TRIAGE_LEASE_TIMEOUT_MS || "300000", 10); // 5 minutes
const llmTimeoutMs = parseInt(process.env.TRIAGE_LLM_TIMEOUT_MS || "60000", 10); // 60 seconds
const maxAttempts = parseInt(process.env.TRIAGE_MAX_ATTEMPTS || "3", 10);
const model = process.env.TRIAGE_MODEL || "claude-3-haiku-20240307";

let running = true;
let isPolling = false;

// Config validation:
// The lease timeout must exceed the LLM request timeout.
// Otherwise, a slow Claude request could exceed the lease duration, allowing other workers
// to reclaim and run duplicate requests before the first one completes.
if (leaseTimeoutMs <= llmTimeoutMs) {
  throw new Error("TRIAGE_LEASE_TIMEOUT_MS must be greater than TRIAGE_LLM_TIMEOUT_MS");
}

// Fail-fast boot block: ANTHROPIC_API_KEY is required in non-testing environments.
if (!process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV !== "test") {
  console.error("❌ ANTHROPIC_API_KEY environment variable is required.");
  process.exit(1);
}

/**
 * pollCycle
 * Performs a single queue check and processing run.
 *
 * How it works:
 * 1. Enters a short transaction to lease a batch of claimable jobs.
 * 2. The claim query selects jobs where:
 *     - Status is 'pending' or 'failed' (attempts < maxAttempts) and next_attempt_at has arrived.
 *     - OR status is 'leased' but the lease expired (locked_at is older than leaseTimeoutMs).
 * 3. It utilizes FOR UPDATE SKIP LOCKED to lock these rows and ignore rows locked by concurrent workers.
 * 4. It immediately updates these rows to 'leased' status, sets locked_by to workerId,
 *    increments attempts count, and returns the leased jobs.
 * 5. Commits the lease transaction immediately (freeing DB locks).
 * 6. Launches processTriageJob for each job concurrently via Promise.all (running outside transactions).
 */
async function pollCycle() {
  if (isPolling || !running) return;
  isPolling = true;

  try {
    const now = Date.now();

    // Claim jobs inside a short transactional row-locking window
    const claimedJobs = await withTransaction(async (client) => {
      const claimRes = await client.query<{
        session_id: string;
        project_id: string;
        attempts: number;
      }>(
        `
        WITH claimable AS (
          SELECT session_id
          FROM triage_jobs
          WHERE (
                  (status = 'pending' OR status = 'failed') 
                  AND attempts < $1 
                  AND next_attempt_at <= $2
                )
             OR (status = 'leased' AND locked_at < $3)
          ORDER BY created_at ASC
          LIMIT $4
          FOR UPDATE SKIP LOCKED
        )
        UPDATE triage_jobs
        SET status = 'leased',
            locked_at = $2,
            locked_by = $5,
            attempts = attempts + 1,
            updated_at = $2
        FROM claimable
        WHERE triage_jobs.session_id = claimable.session_id
        RETURNING triage_jobs.session_id, triage_jobs.project_id, triage_jobs.attempts;
        `,
        [maxAttempts, now, now - leaseTimeoutMs, batchSize, workerId]
      );
      return claimRes.rows;
    });

    if (claimedJobs.length > 0) {
      console.info(
        JSON.stringify({
          level: "info",
          workerId,
          action: "lease_acquired",
          count: claimedJobs.length,
          message: `Leased ${claimedJobs.length} jobs to process.`,
        })
      );

      // Process batch concurrently outside the claiming transaction
      await Promise.all(
        claimedJobs.map((job) =>
          processTriageJob(job.session_id, job.project_id, job.attempts, {
            workerId,
            model,
            maxAttempts,
            llmTimeoutMs,
          }).catch((err) => {
            console.error(`[Worker] Uncaught exception processing job ${job.session_id}:`, err);
          })
        )
      );
    }
  } catch (err) {
    console.error("[Worker] Polling iteration failed:", err);
  } finally {
    isPolling = false;
  }
}

/**
 * startWorker
 * Polling loop driver called at startup.
 *
 * How it works:
 * 1. Generates a random startup jitter up to 5 seconds to stagger polling cycles across replicas.
 * 2. Awaits the jitter duration.
 * 3. Executes the initial poll cycle.
 * 4. Schedules regular polling iterations using setInterval.
 */
async function startWorker() {
  // Apply startup jitter up to 5 seconds to reduce lock contention across instances
  const startupJitterMs = Math.floor(Math.random() * 5000);
  console.info(`[Worker] Initialized as ${workerId}. Startup jitter: ${startupJitterMs}ms...`);

  await new Promise((resolve) => setTimeout(resolve, startupJitterMs));

  console.info(`[Worker] Starting claim loop (batch: ${batchSize}, interval: ${pollIntervalMs}ms, model: ${model})`);

  // Run initial poll cycle
  await pollCycle();

  // Schedule regular iterations
  const intervalId = setInterval(async () => {
    if (!running) {
      clearInterval(intervalId);
      return;
    }
    await pollCycle();
  }, pollIntervalMs);
}

/**
 * handleShutdown
 * Graceful termination handler.
 * Stops scheduling new iterations, waits for any active pollCycle to finish,
 * closes the DB connection pool, and exits the process.
 *
 * @param signal Termination signal string (SIGINT/SIGTERM).
 */
function handleShutdown(signal: string) {
  if (!running) return;
  running = false;
  console.info(`[Worker] Received ${signal}. Shutting down worker loop gracefully...`);

  // Wait for currently running poll cycle to finish, then close database pool
  const checkInterval = setInterval(async () => {
    if (!isPolling) {
      clearInterval(checkInterval);
      console.info("[Worker] Claim loop stopped. Closing database connection pool...");
      await pool.end();
      console.info("[Worker] Shutdown complete.");
      process.exit(0);
    }
  }, 500);
}

// Register OS termination hooks
process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

// Execute only if run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("triage-worker.ts")) {
  startWorker().catch((err) => {
    console.error("❌ Fatal error starting worker:", err);
    process.exit(1);
  });
}

export { startWorker, pollCycle, workerId };
