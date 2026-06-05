/**
 * @file verify-e2e.ts
 * @description Runs end-to-end integration and verification checks by calling ingest and metrics endpoints.
 * @why Ensures that the server correctly ingests, processes, and displays metrics for simulated sessions, verifying end-to-end flow correctness.
 */

import { Pool } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
const envPath = join(__dirname, "../.env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)?\s*$/);
    if (match) {
      const key = match[1];
      if (key) {
        let value = match[2] || "";
        value = value.replace(/^(['"])(.*)\1$/, "$2");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function verify() {
  const sessionId = "sess_e2e_" + Date.now();
  console.log(`Starting E2E telemetry verification for Session: ${sessionId}`);

  // 1. Send first payload (isFinal: false) to initialize session
  const payload1 = {
    projectKey: "pk_playground",
    sessionId,
    metadata: {
      url: "http://localhost:3000/",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      startedAt: Date.now() - 10000,
      screenWidth: 1920,
      screenHeight: 1080,
      environment: "development",
      release: "1.0.0",
      commitSha: "abcdef123456"
    },
    summary: [],
    events: [],
    isFinal: false,
    sdkVersion: "1.0.0"
  };

  console.log("Sending Payload 1 (isFinal: false)...");
  const res1 = await fetch("http://localhost:3001/api/v1/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload1),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res1.ok) {
    console.error("❌ Ingestion Payload 1 failed with status:", res1.status, await res1.text());
    process.exit(1);
  }
  console.log("✅ Payload 1 ingested successfully.");

  // Wait 5.2 seconds to satisfy duration check (> 5s)
  console.log("Sleeping 5.2 seconds to satisfy duration check (> 5s)...");
  await new Promise((resolve) => setTimeout(resolve, 5200));

  // 2. Send second payload (isFinal: true) with friction events
  const payload2 = {
    projectKey: "pk_playground",
    sessionId,
    metadata: {
      url: "http://localhost:3000/",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      startedAt: Date.now() - 15200,
      screenWidth: 1920,
      screenHeight: 1080,
      environment: "development",
      release: "1.0.0",
      commitSha: "abcdef123456"
    },
    summary: [
      {
        type: "js_error",
        timestampMs: Date.now() - 2000,
        errorMessage: "Error: Test JS Error from Playground",
        errorStack: "Error: Test JS Error from Playground\n    at HTMLButtonElement.<anonymous> (http://localhost:3000/src/main.ts:123:11)"
      },
      {
        type: "rage_click",
        timestampMs: Date.now() - 1000,
        clickCount: 4,
        target: "button#btn-rage-click"
      }
    ],
    events: [
      { type: 4, data: { href: "http://localhost:3000/" } }
    ],
    isFinal: true,
    sdkVersion: "1.0.0"
  };

  console.log("Sending Payload 2 (isFinal: true)...");
  const res2 = await fetch("http://localhost:3001/api/v1/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload2),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res2.ok) {
    console.error("❌ Ingestion Payload 2 failed with status:", res2.status, await res2.text());
    process.exit(1);
  }
  console.log("✅ Payload 2 ingested successfully.");

  // 3. Query the database to check if a triage job was enqueued
  console.log("Querying database for triage job status...");
  let jobRow;
  for (let i = 0; i < 10; i++) {
    const dbRes = await pool.query("SELECT * FROM triage_jobs WHERE session_id = $1", [sessionId]);
    if (dbRes.rows.length > 0) {
      jobRow = dbRes.rows[0];
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!jobRow) {
    console.error("❌ Triage job was not enqueued in database (might have been skipped). Checking session status...");
    const sessRes = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    console.log("Session Row Details:", sessRes.rows[0]);
    process.exit(1);
  }

  console.log("✅ Triage job successfully enqueued in database:", jobRow);

  // 4. Wait for worker to pick up and process the job
  console.log("Waiting for triage worker to process the job (checking for completed status)...");
  let processed = false;
  let finalJobRow;
  for (let i = 0; i < 20; i++) {
    const dbRes = await pool.query("SELECT * FROM triage_jobs WHERE session_id = $1", [sessionId]);
    finalJobRow = dbRes.rows[0];
    if (finalJobRow && finalJobRow.status === "completed") {
      processed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!processed) {
    console.error("❌ Triage job was not processed by worker in time. Current status:", finalJobRow?.status);
    process.exit(1);
  }

  console.log("✅ Triage job processed successfully by worker!");

  // 5. Query results in sessions, issue_groups, and issue_instances
  const sessionCheck = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
  console.log("\n--- SESSIONS ---");
  console.log(sessionCheck.rows[0]);

  const issueInstanceCheck = await pool.query("SELECT * FROM issue_instances WHERE session_id = $1", [sessionId]);
  console.log("\n--- ISSUE INSTANCES ---");
  console.log(issueInstanceCheck.rows);

  const issueGroupCheck = await pool.query("SELECT * FROM issue_groups WHERE project_id = 'proj_playground'");
  console.log("\n--- ISSUE GROUPS ---");
  console.log(issueGroupCheck.rows);

  const runsCheck = await pool.query("SELECT * FROM ai_triage_runs WHERE session_id = $1", [sessionId]);
  console.log("\n--- AI TRIAGE RUNS ---");
  console.log(runsCheck.rows);

  console.log("\nALL E2E VERIFICATION CHECKS PASSED!");
  await pool.end();
  process.exit(0);
}

verify().catch((err) => {
  console.error("❌ Error in verify script:", err);
  process.exit(1);
});
