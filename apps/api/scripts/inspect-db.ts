import { loadEnv, getPool } from "./setup.js";

loadEnv();
const pool = getPool();

async function inspect() {
  try {
    console.log("=== PROJECTS ===");
    const { rows: projects } = await pool.query("SELECT id, name, triage_model FROM projects");
    console.log(projects);

    console.log("\n=== SESSIONS ===");
    const { rows: sessions } = await pool.query("SELECT id, url, duration_ms, environment, started_at, ai_analyzed_at FROM sessions");
    console.log(sessions);

    console.log("\n=== TRIAGE JOBS ===");
    const { rows: jobs } = await pool.query("SELECT session_id, status, attempts, last_error, next_attempt_at FROM triage_jobs");
    console.log(jobs);

    console.log("\n=== AI TRIAGE RUNS ===");
    const { rows: runs } = await pool.query("SELECT id, session_id, model, status, error_message FROM ai_triage_runs");
    console.log(runs);

    console.log("\n=== EVENTS SUMMARY ===");
    const { rows: summaries } = await pool.query("SELECT session_id, type, error_message, click_count FROM events_summary");
    console.log(summaries);

    console.log("\n=== ISSUE GROUPS ===");
    const { rows: groups } = await pool.query("SELECT id, title, severity, status, confidence FROM issue_groups");
    console.log(groups);

    console.log("\n=== ISSUE INSTANCES ===");
    const { rows: instances } = await pool.query("SELECT id, issue_group_id, session_id, title, severity FROM issue_instances");
    console.log(instances);

    await pool.end();
  } catch (err) {
    console.error("Database query failed:", err);
    await pool.end();
  }
}

inspect();
