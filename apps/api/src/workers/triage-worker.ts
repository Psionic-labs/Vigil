/**
 * @file triage-worker.ts
 * @description Worker loop wrapping the triage job execution queue.
 * @why Drives continuous background processing of session errors to populate insights.
 */


import "dotenv/config";
import os from "node:os";
import crypto from "node:crypto";
import { pool, withTransaction } from "../db";
import { processTriageJob } from "./triage-runner";
import { OpenRouterProvider } from "../lib/ai";

// Standardize worker identity format: hostname:pid:uuid.
// Saved to triage_jobs.locked_by to enable tracing and ownership checks.
const hostname = os.hostname();
const pid = process.pid;
const uuid = crypto.randomBytes(4).toString("hex");
const workerId = `${hostname}:${pid}:${uuid}`;
process.env.WORKER_ID = workerId;

/**
 * readPositiveInteger
 * Helper function to safely parse and validate positive configuration integers.
 * If a value is unconfigured, NaN, or non-positive, it defaults to the fallback and prints a warning.
 *
 * @param name The environment variable key string.
 * @param fallback Default value if validation fails.
 */
function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  console.warn(`[TriageConfig] Invalid ${name} environment variable "${value}". Falling back to ${fallback}.`);
  return fallback;
}

// Parse configuration variables with safe defaults.
const batchSize = readPositiveInteger("TRIAGE_BATCH_SIZE", 10);
const pollIntervalMs = readPositiveInteger("TRIAGE_POLL_INTERVAL_MS", 10000);
const leaseTimeoutMs = readPositiveInteger("TRIAGE_LEASE_TIMEOUT_MS", 300000); // 5 minutes
const llmTimeoutMs = readPositiveInteger("TRIAGE_LLM_TIMEOUT_MS", 60000); // 60 seconds
const maxAttempts = readPositiveInteger("TRIAGE_MAX_ATTEMPTS", 3);
const maxTokens = readPositiveInteger("TRIAGE_MAX_TOKENS", 2000);
const model = process.env.TRIAGE_MODEL || "openrouter/owl-alpha";

let running = true;
let isPolling = false;

/**
 * validateTimeoutBounds
 * Ensures the worker configuration lease timeout is strictly greater than the LLM request timeout.
 * Prevents multiple workers from claiming the same job due to slow LLM response latencies.
 *
 * @param leaseTimeoutMs Configured lease duration in milliseconds.
 * @param llmTimeoutMs Configured maximum LLM timeout limit in milliseconds.
 */
export function validateTimeoutBounds(leaseTimeoutMs: number, llmTimeoutMs: number) {
  if (leaseTimeoutMs <= llmTimeoutMs) {
    throw new Error("TRIAGE_LEASE_TIMEOUT_MS must be greater than TRIAGE_LLM_TIMEOUT_MS");
  }
}

validateTimeoutBounds(leaseTimeoutMs, llmTimeoutMs);

// Fail-fast boot block: OPENROUTER_API_KEY is required in non-testing environments unless MOCK_AI is enabled.
const useMockAi =
  process.env.MOCK_AI === "true" &&
  process.env.NODE_ENV !== "production";

if (process.env.MOCK_AI === "true" && process.env.NODE_ENV === "production") {
  console.warn("[TriageConfig] MOCK_AI=true is ignored in production. Unset it or use a real provider.");
}

if (!useMockAi && !process.env.OPENROUTER_API_KEY && process.env.NODE_ENV !== "test") {
  console.error("❌ OPENROUTER_API_KEY environment variable is required.");
  process.exit(1);
}

// Construct the provider once at boot. Timeout and model are baked into the instance.
const provider = useMockAi
  ? {
      invoke: async () => {
        console.info("[MockAI] Intercepted prompt call, simulating LLM response.");
        const mockData = {
          session_summary: "Mock AI Triage: User session simulated from playground, containing simulated JS errors and user clicks.",
          goal_completed: false,
          friction_score: 75,
          confidence: 0.9,
          reasoning: "Telemetry logs show 1 unhandled JS error and 4 rage clicks. The user did not reach a success/confirmation state.",
          issue_detected: true,
          issue_group_action: "create",
          issues: [
            {
              title: "Test JS Error from Playground",
              root_cause: "Client-side scripting exception thrown when clicking the JS Error trigger button.",
              suggested_fix: "Validate playground button trigger behavior and check error boundary configurations.",
              severity: "P1",
              confidence: 0.95,
              reproduction_steps: [
                "Open Vigil SDK playground UI",
                "Click on 'Throw JS Error' trigger button"
              ],
              evidence: [
                {
                  type: "js_error",
                  timestamp_ms: Date.now(),
                  detail: "Error: Test JS Error from Playground"
                }
              ]
            }
          ]
        };
        return {
          rawContent: `\`\`\`json\n${JSON.stringify(mockData, null, 2)}\n\`\`\``,
          model: "mock-model",
          input_tokens: 150,
          output_tokens: 280,
        };
      }
    }
  : process.env.NODE_ENV !== "test"
  ? new OpenRouterProvider({
      apiKey: process.env.OPENROUTER_API_KEY!,
      model,
      maxTokens,
      timeoutMs: llmTimeoutMs,
    })
  : (null as any); // In test environments, the provider is injected via RunnerOptions

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
            provider,
            maxAttempts,
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

export { startWorker, pollCycle, workerId, maxAttempts, leaseTimeoutMs };
