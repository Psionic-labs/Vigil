import "dotenv/config";
import { pool } from "../src/db";

async function run() {
  const projectId = "proj_wp6iwagmqtnf84u"; // User's 'gg' project ID
  const issueGroupId = "igr_test_manual_raise";
  const sessionId = "sess_test_manual_raise";
  const instanceId = "ii_test_manual_raise";
  const now = Date.now();

  console.log(`Seeding mock issue and session for project ${projectId}...`);

  try {
    // 1. Clean up any existing mock data with these IDs
    await pool.query("DELETE FROM issue_instances WHERE id = $1", [instanceId]);
    await pool.query("DELETE FROM issue_groups WHERE id = $1", [issueGroupId]);
    await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);

    // 2. Insert issue group
    await pool.query(
      `INSERT INTO issue_groups (
        id, project_id, fingerprint, title, root_cause, suggested_fix,
        severity, status, confidence, reproduction_steps_json,
        affected_session_count, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [
        issueGroupId,
        projectId,
        "fp_test_manual_raise_fingerprint",
        "TypeError: Cannot read properties of null (reading 'profile')",
        "An exception is thrown in the UserCard component when the user profile data is empty or null.",
        "const userProfile = user?.profile || {};\nreturn <UserCard profile={userProfile} />;",
        "P1",
        "open",
        0.95,
        JSON.stringify(["Log in to dashboard", "Navigate to Account Settings", "Wait for profile to load"]),
        1,
        now - 3600000,
        now,
        now,
      ]
    );
    console.log("Seeded issue_groups row.");

    // 3. Insert session
    await pool.query(
      `INSERT INTO sessions (
        id, project_id, url, user_agent, environment, sdk_version,
        started_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sessionId,
        projectId,
        "http://localhost:3000/settings",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "production",
        "1.0.0",
        now - 3600000,
        now - 3600000,
        now,
      ]
    );
    console.log("Seeded sessions row.");

    // 4. Insert issue instance
    await pool.query(
      `INSERT INTO issue_instances (
        id, issue_group_id, session_id, project_id, title, root_cause,
        suggested_fix, severity, timestamp_ms, confidence, evidence_json,
        reproduction_json, created_at, fingerprint, ai_confidence, detected_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        instanceId,
        issueGroupId,
        sessionId,
        projectId,
        "TypeError: Cannot read properties of null (reading 'profile')",
        "An exception is thrown in the UserCard component when the user profile data is empty or null.",
        "const userProfile = user?.profile || {};\nreturn <UserCard profile={userProfile} />;",
        "P1",
        now - 3600000,
        0.95,
        JSON.stringify([]),
        JSON.stringify(["Log in to dashboard", "Navigate to Account Settings", "Wait for profile to load"]),
        now,
        "fp_test_manual_raise_fingerprint",
        0.95,
        now,
        now
      ]
    );
    console.log("Seeded issue_instances row.");

    console.log("✅ Seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
