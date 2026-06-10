import 'dotenv/config';
import { pool } from '../apps/api/src/db';

async function main() {
  // 1. Get active project details from DB
  const projectRes = await pool.query("SELECT id, public_key, name FROM projects WHERE is_active = true LIMIT 1");
  if (projectRes.rows.length === 0) {
    console.error("❌ No active projects found in database!");
    pool.end();
    return;
  }

  const { id: projectId, public_key: projectKey, name: projectName } = projectRes.rows[0];
  console.log(`Using active project: ${projectName} (ID: ${projectId}, Key: ${projectKey})`);

  const sessionId = 'sess_real_issue_' + Date.now();
  console.log(`Starting telemetry generation for Session: ${sessionId}`);

  // 2. Send first payload (isFinal: false)
  const payload1 = {
    projectKey,
    sessionId,
    metadata: {
      url: "http://localhost:3002/projects",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      startedAt: Date.now() - 15000,
      screenWidth: 1440,
      screenHeight: 900,
      environment: "production",
      release: "1.2.0",
      commitSha: "f00b4r123456"
    },
    summary: [],
    events: [],
    isFinal: false,
    sdkVersion: "1.0.0"
  };

  console.log("Sending Ingest Payload 1 (isFinal: false)...");
  const res1 = await fetch("http://localhost:3001/api/v1/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload1),
  });

  if (!res1.ok) {
    console.error(`❌ Ingest Payload 1 failed with status ${res1.status}:`, await res1.text());
    pool.end();
    return;
  }
  console.log("✅ Payload 1 ingested successfully.");

  // Sleep 5.2 seconds to satisfy duration check (> 5s)
  console.log("Sleeping 5.2 seconds to satisfy duration check...");
  await new Promise((resolve) => setTimeout(resolve, 5200));

  // 3. Send second payload (isFinal: true) with brand new error signature
  const payload2 = {
    projectKey,
    sessionId,
    metadata: {
      url: "http://localhost:3002/projects",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      startedAt: Date.now() - 20200,
      screenWidth: 1440,
      screenHeight: 900,
      environment: "production",
      release: "1.2.0",
      commitSha: "f00b4r123456"
    },
    summary: [
      {
        type: "js_error",
        timestampMs: Date.now() - 3000,
        errorMessage: "TypeError: Cannot read properties of undefined (reading 'map')",
        errorStack: "TypeError: Cannot read properties of undefined (reading 'map')\n    at ProjectList (http://localhost:3002/components/ProjectList.tsx:24:18)\n    at renderWithHooks (http://localhost:3002/_next/static/chunks/main.js:14532:18)\n    at mountIndeterminateComponent (http://localhost:3002/_next/static/chunks/main.js:17890:24)"
      },
      {
        type: "rage_click",
        timestampMs: Date.now() - 1000,
        clickCount: 6,
        target: "button#refresh-projects"
      }
    ],
    events: [
      { type: 4, data: { href: "http://localhost:3002/projects" } }
    ],
    isFinal: true,
    sdkVersion: "1.0.0"
  };

  console.log("Sending Ingest Payload 2 (isFinal: true)...");
  const res2 = await fetch("http://localhost:3001/api/v1/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload2),
  });

  if (!res2.ok) {
    console.error(`❌ Ingest Payload 2 failed with status ${res2.status}:`, await res2.text());
    pool.end();
    return;
  }
  console.log("✅ Payload 2 ingested successfully.");

  // 4. Poll database for triage job status
  console.log("Waiting for database to reflect triage job...");
  let jobRow;
  for (let i = 0; i < 20; i++) {
    const dbRes = await pool.query("SELECT * FROM triage_jobs WHERE session_id = $1", [sessionId]);
    if (dbRes.rows.length > 0) {
      jobRow = dbRes.rows[0];
      console.log(`Job found! Status: ${jobRow.status}, Attempts: ${jobRow.attempts}`);
      if (jobRow.status === 'completed') {
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (jobRow && jobRow.status === 'completed') {
    console.log("🎉 Triage job has completed successfully!");
    
    // Query the generated issue group
    const issueInstanceRes = await pool.query("SELECT * FROM issue_instances WHERE session_id = $1", [sessionId]);
    if (issueInstanceRes.rows.length > 0) {
      const instance = issueInstanceRes.rows[0];
      const issueGroupRes = await pool.query("SELECT * FROM issue_groups WHERE id = $1", [instance.issue_group_id]);
      console.log("\n--- AI GENERATED ISSUE DETAILS ---");
      console.log(JSON.stringify(issueGroupRes.rows[0], null, 2));
    } else {
      console.log("⚠️ No issue instance was created. Maybe it was classified as normal behavior? Check database.");
    }
  } else {
    console.log(`⌛ Triage job status is currently: ${jobRow ? jobRow.status : 'not_enqueued'}`);
  }

  pool.end();
}

main().catch(err => {
  console.error("❌ Script Error:", err);
  pool.end();
});
