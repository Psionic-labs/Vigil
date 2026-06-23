/**
 * @file e2e-triage-flow.test.ts
 * @description End-to-end integration tests for SDK ingestion, session finalization, triage job enqueuing, and worker AI triage processing.
 * @why Verifies that all components of the ingestion, triage, and dashboard retrieval pipeline operate together seamlessly.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../app";
import { pool } from "../db";
import { processTriageJob } from "../workers/triage-runner";

const databaseUrl = process.env.DATABASE_URL || "";
// Skip e2e tests when there is no real database (e.g. in CI without DATABASE_URL)
const hasRealDb = /^postgres(ql)?:\/\//i.test(databaseUrl) && !databaseUrl.endsWith("//fake");
if (!hasRealDb) {
  describe.skip("End-to-End Triage Flow Integration Tests", () => {
    it("skipped — no DATABASE_URL configured", () => {});
  });
} else {
describe("End-to-End Triage Flow Integration Tests", () => {
  const runSuffix = Math.random().toString(36).substring(2, 10);
  const TEST_PROJECT_ID = `proj_e2e_test_${runSuffix}`;
  const TEST_PUBLIC_KEY = `pk_e2e_test_${runSuffix}`;
  const OWNER_ID = "usr_playground";

  beforeAll(async () => {
    // 1. Clean up any leftover test data
    await pool.query("DELETE FROM triage_jobs WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM issue_instances WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM issue_groups WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM events_summary WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM sessions WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM projects WHERE id = $1", [TEST_PROJECT_ID]);

    // Insert test owner user first (required by fk_projects_owner constraint)
    await pool.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Playground User', 'usr_playground_test@vigil.run', true, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [OWNER_ID, new Date()]
    );

    // 2. Insert test project
    await pool.query(
      `INSERT INTO projects (id, name, public_key, owner_id, is_active, created_at)
       VALUES ($1, 'E2E Test Project', $2, $3, true, $4)`,
      [TEST_PROJECT_ID, TEST_PUBLIC_KEY, OWNER_ID, Date.now()]
    );
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM triage_jobs WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM issue_instances WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM issue_groups WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM events_summary WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM sessions WHERE project_id = $1", [TEST_PROJECT_ID]);
    await pool.query("DELETE FROM projects WHERE id = $1", [TEST_PROJECT_ID]);
  });

  it("Scenario 1: Ingest payload, finalize, triage worker creates new issue group, and dashboard retrieves it", async () => {
    const sessionId = "sess_e2e_s1_" + Date.now();

    // 1. Send telemetry payload (isFinal: false) to start session
    const res1 = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: TEST_PUBLIC_KEY,
        sessionId,
        isFinal: false,
        sdkVersion: "1.0.0",
        metadata: {
          url: "http://localhost:3000/shop",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          startedAt: Date.now() - 10000,
          screenWidth: 1920,
          screenHeight: 1080,
          environment: "production",
        },
        summary: [],
        events: [{ type: 4, data: { href: "http://localhost:3000/shop" } }]
      }),
    });
    expect(res1.status).toBe(200);

    // Update session created_at and started_at in the database to be in the past to satisfy the cheap duration check (> 5s)
    await pool.query(
      "UPDATE sessions SET created_at = created_at - 10000, started_at = started_at - 10000 WHERE id = $1",
      [sessionId]
    );

    // 2. Send finalized payload (isFinal: true) with friction events (js_error, rage_click)
    const res2 = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: TEST_PUBLIC_KEY,
        sessionId,
        isFinal: true,
        sdkVersion: "1.0.0",
        metadata: {
          url: "http://localhost:3000/shop",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          startedAt: Date.now() - 10000,
          screenWidth: 1920,
          screenHeight: 1080,
          environment: "production",
        },
        summary: [
          {
            type: "js_error",
            timestampMs: Date.now() - 5000,
            errorMessage: "Uncaught TypeError: Cannot read properties of null (reading 'style')",
            errorStack: "TypeError: Cannot read properties of null (reading 'style')\n  at main.js:42:15"
          },
          {
            type: "rage_click",
            timestampMs: Date.now() - 2000,
            clickCount: 6,
            target: "button#checkout"
          }
        ],
        events: []
      }),
    });
    expect(res2.status).toBe(200);

    // 3. Verify triage job enqueued
    const jobRes = await pool.query("SELECT * FROM triage_jobs WHERE session_id = $1", [sessionId]);
    expect(jobRes.rowCount).toBe(1);
    expect(jobRes.rows[0].status).toBe("pending");

    // 4. Run triage poll/process using processTriageJob directly with mock AI
    const mockAiResponse = {
      session_summary: "User suffered a TypeError when clicking the checkout button.",
      goal_completed: false,
      friction_score: 95,
      confidence: 0.92,
      reasoning: "The javascript exception directly blocked the checkout click flow.",
      issue_detected: true,
      issue_group_action: "create",
      issues: [
        {
          title: "Checkout button crashes page",
          root_cause: "TypeError thrown in main.js style modifier.",
          suggested_fix: "Check null reference on checkout button style property.",
          severity: "P1",
          confidence: 0.92,
          reproduction_steps: [
            "Go to shop page",
            "Click checkout button"
          ],
          evidence: [
            {
              type: "js_error",
              timestamp_ms: Date.now() - 5000,
              detail: "Uncaught TypeError: Cannot read properties of null (reading 'style')"
            }
          ]
        }
      ]
    };

    const mockProvider = {
      invoke: async () => ({
        rawContent: `\`\`\`json\n${JSON.stringify(mockAiResponse)}\n\`\`\``,
        model: "mock-model",
        input_tokens: 100,
        output_tokens: 200,
      }),
    };

    // Transition status to leased to simulate worker claiming
    await pool.query(
      `UPDATE triage_jobs SET status = 'leased', locked_by = 'e2e_test_worker', locked_at = $1 WHERE session_id = $2`,
      [Date.now(), sessionId]
    );

    await processTriageJob(sessionId, TEST_PROJECT_ID, 1, {
      workerId: "e2e_test_worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // 5. Verify database records
    const sessionRes = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    expect(sessionRes.rows[0].ai_analyzed_at).not.toBeNull();
    expect(sessionRes.rows[0].ai_friction_score).toBe(95);

    const groupRes = await pool.query("SELECT * FROM issue_groups WHERE project_id = $1", [TEST_PROJECT_ID]);
    expect(groupRes.rowCount).toBe(1);
    expect(groupRes.rows[0].title).toBe("Checkout button crashes page");

    const instanceRes = await pool.query("SELECT * FROM issue_instances WHERE session_id = $1", [sessionId]);
    expect(instanceRes.rowCount).toBe(1);
    expect(instanceRes.rows[0].issue_group_id).toBe(groupRes.rows[0].id);

    const runRes = await pool.query("SELECT * FROM ai_triage_runs WHERE session_id = $1", [sessionId]);
    expect(runRes.rowCount).toBe(1);
    expect(runRes.rows[0].status).toBe("completed");

    // 6. Verify dashboard API retrieval
    const issuesApiRes = await app.request(`/api/v1/issues?projectId=${TEST_PROJECT_ID}`);
    expect(issuesApiRes.status).toBe(200);
    const issuesJson = await issuesApiRes.json();
    expect(issuesJson.data.length).toBe(1);
    expect(issuesJson.data[0].title).toBe("Checkout button crashes page");

    const issueDetailRes = await app.request(`/api/v1/issues/${groupRes.rows[0].id}`);
    expect(issueDetailRes.status).toBe(200);
    const detailJson = await issueDetailRes.json();
    expect(detailJson.data.title).toBe("Checkout button crashes page");
    expect(detailJson.data.affectedSessions.length).toBe(1);
    expect(detailJson.data.affectedSessions[0].id).toBe(sessionId);
  }, 15000);

  it("Scenario 2: Triage worker attaches new session to existing issue group and dashboard updates count", async () => {
    // 1. Create a pre-seeded issue group
    const existingGroupId = "igr_e2e_existing_attach_" + runSuffix;
    const fingerprint = "checkout_js_error_fingerprint_s2_" + runSuffix;
    await pool.query(
      `INSERT INTO issue_groups (id, project_id, fingerprint, title, root_cause, suggested_fix, severity, status, confidence, reproduction_steps_json, evidence_summary, affected_session_count, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'Seeded Issue Group', 'Seeded root cause', 'Seeded suggested fix', 'P1', 'open', 0.9, '[]', '[]', 1, $4, $4, $4, $4)`,
      [existingGroupId, TEST_PROJECT_ID, fingerprint, Date.now() - 10000]
    );

    const sessionId = "sess_e2e_s2_" + Date.now();

    // 2. Ingest payload (isFinal: false) to start session
    const res1 = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: TEST_PUBLIC_KEY,
        sessionId,
        isFinal: false,
        sdkVersion: "1.0.0",
        metadata: {
          url: "http://localhost:3000/shop",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          startedAt: Date.now() - 10000,
          screenWidth: 1920,
          screenHeight: 1080,
          environment: "production",
        },
        summary: [],
        events: []
      }),
    });
    expect(res1.status).toBe(200);

    // Update session created_at and started_at in the database to be in the past to satisfy the cheap duration check (> 5s)
    await pool.query(
      "UPDATE sessions SET created_at = created_at - 10000, started_at = started_at - 10000 WHERE id = $1",
      [sessionId]
    );

    // Ingest finalized session (use distinct error signature to avoid collision on index)
    const res2 = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: TEST_PUBLIC_KEY,
        sessionId,
        isFinal: true,
        sdkVersion: "1.0.0",
        metadata: {
          url: "http://localhost:3000/shop",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          startedAt: Date.now() - 10000,
          screenWidth: 1920,
          screenHeight: 1080,
          environment: "production",
        },
        summary: [
          {
            type: "js_error",
            timestampMs: Date.now() - 5000,
            errorMessage: "Uncaught TypeError: Scenario 2 unique error",
            errorStack: "TypeError: Scenario 2 unique error\n  at main.js:10:15"
          }
        ],
        events: []
      }),
    });
    expect(res2.status).toBe(200);

    // 3. Mock AI with action: attach
    const mockAiResponse = {
      session_summary: "User hit the same checkout crash.",
      goal_completed: false,
      friction_score: 90,
      confidence: 0.95,
      reasoning: "Matches fingerprint of the seeded checkout crash.",
      issue_detected: true,
      issue_group_action: "attach",
      issue_group_id: existingGroupId,
    };

    const mockProvider = {
      invoke: async () => ({
        rawContent: `\`\`\`json\n${JSON.stringify(mockAiResponse)}\n\`\`\``,
        model: "mock-model",
        input_tokens: 100,
        output_tokens: 200,
      }),
    };

    // Transition status to leased to simulate worker claiming
    await pool.query(
      `UPDATE triage_jobs SET status = 'leased', locked_by = 'e2e_test_worker', locked_at = $1 WHERE session_id = $2`,
      [Date.now(), sessionId]
    );

    // Seed the event fingerprint
    const evRes = await pool.query("SELECT fingerprint FROM events_summary WHERE session_id = $1 LIMIT 1", [sessionId]);
    const computedFp = evRes.rows[0]?.fingerprint;
    if (computedFp) {
      await pool.query("UPDATE issue_groups SET fingerprint = $1 WHERE id = $2", [computedFp, existingGroupId]);
    }

    await processTriageJob(sessionId, TEST_PROJECT_ID, 1, {
      workerId: "e2e_test_worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // 4. Verify no new issue group was created — the seeded group's count incremented and instance points to it
    const seededGroupRes = await pool.query("SELECT * FROM issue_groups WHERE id = $1", [existingGroupId]);
    expect(seededGroupRes.rowCount).toBe(1);
    expect(seededGroupRes.rows[0].affected_session_count).toBe(2); // incremented from 1 to 2

    const instanceRes = await pool.query("SELECT * FROM issue_instances WHERE session_id = $1", [sessionId]);
    expect(instanceRes.rowCount).toBe(1);
    expect(instanceRes.rows[0].issue_group_id).toBe(existingGroupId);
  }, 15000);

  it("Scenario 3: Triage worker ignores session, and ai_triage_runs registers the outcome", async () => {
    const sessionId = "sess_e2e_s3_" + Date.now();

    // 1. Ingest payload (isFinal: false) to start session
    const res1 = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: TEST_PUBLIC_KEY,
        sessionId,
        isFinal: false,
        sdkVersion: "1.0.0",
        metadata: {
          url: "http://localhost:3000/shop",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          startedAt: Date.now() - 10000,
          screenWidth: 1920,
          screenHeight: 1080,
          environment: "production",
        },
        summary: [],
        events: []
      }),
    });
    expect(res1.status).toBe(200);

    // Update session created_at and started_at in the database to be in the past to satisfy the cheap duration check (> 5s)
    await pool.query(
      "UPDATE sessions SET created_at = created_at - 10000, started_at = started_at - 10000 WHERE id = $1",
      [sessionId]
    );

    // Ingest finalized session (use distinct error signature to avoid fingerprint collisions)
    const res2 = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectKey: TEST_PUBLIC_KEY,
        sessionId,
        isFinal: true,
        sdkVersion: "1.0.0",
        metadata: {
          url: "http://localhost:3000/shop",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          startedAt: Date.now() - 10000,
          screenWidth: 1920,
          screenHeight: 1080,
          environment: "production",
        },
        summary: [
          {
            type: "js_error",
            timestampMs: Date.now() - 5000,
            errorMessage: "Minor console warnings that don't block user Scenario 3",
            errorStack: "Error\n  at main.js:20:1"
          }
        ],
        events: []
      }),
    });
    expect(res2.status).toBe(200);

    // 2. Mock AI with action: ignore
    const mockAiResponse = {
      session_summary: "No significant issue detected.",
      goal_completed: true,
      friction_score: 5,
      confidence: 0.85,
      reasoning: "The error is a non-blocking console log.",
      issue_detected: false,
      issue_group_action: "ignore",
    };

    const mockProvider = {
      invoke: async () => ({
        rawContent: `\`\`\`json\n${JSON.stringify(mockAiResponse)}\n\`\`\``,
        model: "mock-model",
        input_tokens: 100,
        output_tokens: 200,
      }),
    };

    // Transition status to leased to simulate worker claiming
    await pool.query(
      `UPDATE triage_jobs SET status = 'leased', locked_by = 'e2e_test_worker', locked_at = $1 WHERE session_id = $2`,
      [Date.now(), sessionId]
    );

    await processTriageJob(sessionId, TEST_PROJECT_ID, 1, {
      workerId: "e2e_test_worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // 3. Verify database
    const sessionRes = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    expect(sessionRes.rows[0].ai_analysis_skipped).toBe(true);
    expect(sessionRes.rows[0].ai_skip_reason).toBe("ignore");

    const instanceCheck = await pool.query("SELECT * FROM issue_instances WHERE session_id = $1", [sessionId]);
    expect(instanceCheck.rowCount).toBe(0);

    const runRes = await pool.query("SELECT * FROM ai_triage_runs WHERE session_id = $1", [sessionId]);
    expect(runRes.rowCount).toBe(1);
    expect(runRes.rows[0].status).toBe("ignored");
  }, 15000);
});
}
