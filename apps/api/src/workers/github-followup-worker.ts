/**
 * @file github-followup-worker.ts
 * @description Background polling daemon to sync session counts as comments on GitHub issues.
 * @why Regularly batches session updates so GitHub issues reflect current user impact levels without spamming the API.
 */
import "dotenv/config";
import { pool } from "../db";
import { postFollowUpComment } from "../lib/github-issue-service";

const pollIntervalMs = parseInt(process.env.GITHUB_FOLLOWUP_POLL_INTERVAL_MS || "300000", 10); // default: 5 minutes

let running = true;
let isPolling = false;

/**
 * Executes a single polling cycle to query candidates and trigger comments.
 */
async function pollCycle() {
  if (isPolling || !running) return;
  isPolling = true;

  try {
    // Find all issue groups where the session count exceeds the last commented checkpoint by 5+
    const result = await pool.query<{ id: string; project_id: string }>(
      `SELECT ig.id, ig.project_id
       FROM issue_groups ig
       JOIN projects p ON ig.project_id = p.id
       JOIN github_connections gc ON p.id = gc.project_id
       WHERE ig.github_issue_url IS NOT NULL
         AND ig.github_issue_number IS NOT NULL
         AND ig.affected_session_count >= COALESCE(ig.github_last_comment_session_count, 0) + 5
         AND p.github_comment_enabled = true
         AND gc.connection_status = 'active'`
    );

    const candidates = result.rows;

    if (candidates.length > 0) {
      console.info(`[GitHubFollowUp] Found ${candidates.length} issue group(s) qualifying for follow-up comments.`);
      
      // Process sequential updates to respect rate limits and order
      for (const item of candidates) {
        if (!running) break;
        await postFollowUpComment({
          projectId: item.project_id,
          issueGroupId: item.id,
        });
      }
    }
  } catch (err) {
    console.error("[GitHubFollowUp] Polling cycle failed:", err);
  } finally {
    isPolling = false;
  }
}

/**
 * Initializes and starts the loop.
 */
async function startWorker() {
  console.info(`[GitHubFollowUp] Starting comment follow-up loop (interval: ${pollIntervalMs}ms)`);

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

function handleShutdown(signal: string) {
  if (!running) return;
  running = false;
  console.info(`[GitHubFollowUp] Received ${signal}. Shutting down follow-up worker gracefully...`);

  const checkInterval = setInterval(async () => {
    if (!isPolling) {
      clearInterval(checkInterval);
      console.info("[GitHubFollowUp] Loop stopped.");
      process.exit(0);
    }
  }, 200);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("github-followup-worker.ts")) {
  startWorker().catch((err) => {
    console.error("❌ Fatal error starting follow-up worker:", err);
    process.exit(1);
  });
}

export { startWorker, pollCycle };
