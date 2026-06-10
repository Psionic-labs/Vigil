/**
 * @file sessions.ts
 * @description Dashboard API routes for retrieving project sessions and details.
 * @why Enables the developer dashboard to query recorded user sessions and timelines.
 */

import { Hono } from "hono";
import { pool } from "../db";
import type { AppEnv } from "../lib/types";
import { readAllSessionEvents } from "../lib/blob-storage";

export const sessionsRouter = new Hono<AppEnv>();

const OWNER_ID = "usr_playground";

// GET /api/v1/sessions?projectId=...
sessionsRouter.get("/", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ ok: false, success: false, error: "Missing projectId" }, 400);
    }

    // 1. Verify project ownership and active status
    const projectCheck = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND owner_id = $2 AND is_active = true`,
      [projectId, OWNER_ID]
    );

    if (projectCheck.rowCount === 0) {
      return c.json({ ok: false, success: false, error: "Project not found or unauthorized" }, 404);
    }

    // 2. Query sessions
    const result = await pool.query(
      `SELECT id, url, user_agent, screen_width, screen_height, release, commit_sha, environment,
              duration_ms, started_at, has_js_error, has_rage_click, has_network_err, has_dead_click,
              error_count, issue_instance_count, ai_session_summary, ai_goal_completed,
              ai_friction_score, ai_triage_confidence
       FROM sessions
       WHERE project_id = $1
       ORDER BY started_at DESC`,
      [projectId]
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      url: row.url,
      user_agent: row.user_agent || "",
      screen_width: row.screen_width != null ? Number(row.screen_width) : 0,
      screen_height: row.screen_height != null ? Number(row.screen_height) : 0,
      release: row.release || "",
      commit_sha: row.commit_sha || "",
      environment: row.environment || "",
      duration_ms: row.duration_ms != null ? Number(row.duration_ms) : 0,
      started_at: Number(row.started_at),
      has_js_error: Boolean(row.has_js_error),
      has_rage_click: Boolean(row.has_rage_click),
      has_network_err: Boolean(row.has_network_err),
      has_dead_click: Boolean(row.has_dead_click),
      error_count: Number(row.error_count || 0),
      issue_instance_count: Number(row.issue_instance_count || 0),
      ai_session_summary: row.ai_session_summary || "",
      ai_goal_completed: row.ai_goal_completed != null ? Boolean(row.ai_goal_completed) : false,
      ai_friction_score: row.ai_friction_score != null ? Number(row.ai_friction_score) : 0,
      ai_triage_confidence: row.ai_triage_confidence != null ? Number(row.ai_triage_confidence) : 0,
    }));

    return c.json({ ok: true, success: true, data });
  } catch (error) {
    console.error("Failed to list sessions:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});

// GET /api/v1/sessions/:id
sessionsRouter.get("/:id", async (c) => {
  try {
    const sessionId = c.req.param("id");

    // Run all 3 independent queries in parallel
    const [sessionRes, timelineRes, issuesRes] = await Promise.all([
      pool.query(
        `SELECT s.id, s.project_id, s.url, s.user_agent, s.screen_width, s.screen_height, s.release, s.commit_sha,
                s.environment, s.duration_ms, s.started_at, s.has_js_error, s.has_rage_click, s.has_network_err,
                s.has_dead_click, s.error_count, s.issue_instance_count, s.ai_session_summary,
                s.ai_goal_completed, s.ai_friction_score, s.ai_triage_confidence, s.blob_path
         FROM sessions s
         JOIN projects p ON s.project_id = p.id
         WHERE s.id = $1 AND p.owner_id = $2 AND p.is_active = true`,
        [sessionId, OWNER_ID]
      ),
      pool.query(
        `SELECT type, timestamp_ms, target, error_message, error_stack,
                network_url, network_status, network_method, click_count, nav_to
         FROM events_summary
         WHERE session_id = $1
         ORDER BY timestamp_ms ASC
         LIMIT 500`,
        [sessionId]
      ),
      pool.query(
        `SELECT ig.id, ig.title, ig.severity
         FROM issue_instances ii
         JOIN issue_groups ig ON ii.issue_group_id = ig.id
         WHERE ii.session_id = $1
         ORDER BY ii.created_at DESC`,
        [sessionId]
      ),
    ]);

    if (sessionRes.rowCount === 0) {
      return c.json({ ok: false, success: false, error: "Session not found or unauthorized" }, 404);
    }

    const row = sessionRes.rows[0];

    const sessionDetail = {
      id: row.id,
      project_id: row.project_id,
      url: row.url,
      user_agent: row.user_agent || "",
      screen_width: row.screen_width != null ? Number(row.screen_width) : 0,
      screen_height: row.screen_height != null ? Number(row.screen_height) : 0,
      release: row.release || "",
      commit_sha: row.commit_sha || "",
      environment: row.environment || "",
      duration_ms: row.duration_ms != null ? Number(row.duration_ms) : 0,
      started_at: Number(row.started_at),
      has_js_error: Boolean(row.has_js_error),
      has_rage_click: Boolean(row.has_rage_click),
      has_network_err: Boolean(row.has_network_err),
      has_dead_click: Boolean(row.has_dead_click),
      error_count: Number(row.error_count || 0),
      issue_instance_count: Number(row.issue_instance_count || 0),
      ai_session_summary: row.ai_session_summary || "",
      ai_goal_completed: row.ai_goal_completed != null ? Boolean(row.ai_goal_completed) : false,
      ai_friction_score: row.ai_friction_score != null ? Number(row.ai_friction_score) : 0,
      ai_triage_confidence: row.ai_triage_confidence != null ? Number(row.ai_triage_confidence) : 0,
      blob_path: row.blob_path || null,
      timeline: timelineRes.rows.map((t) => ({
        type: t.type,
        timestamp_ms: Number(t.timestamp_ms),
        target: t.target || undefined,
        error_message: t.error_message || undefined,
        error_stack: t.error_stack || undefined,
        network_url: t.network_url || undefined,
        network_status: t.network_status != null ? Number(t.network_status) : undefined,
        network_method: t.network_method || undefined,
        click_count: t.click_count != null ? Number(t.click_count) : undefined,
        nav_to: t.nav_to || undefined,
      })),
      linkedIssues: issuesRes.rows.map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
      })),
    };

    return c.json({ ok: true, success: true, data: sessionDetail });
  } catch (error) {
    console.error("Failed to get session details:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});

// GET /api/v1/sessions/:id/events
sessionsRouter.get("/:id/events", async (c) => {
  try {
    const sessionId = c.req.param("id");

    // Verify project ownership of the session by joining with projects and select blob_path and project_id
    const sessionRes = await pool.query(
      `SELECT s.blob_path, s.project_id
       FROM sessions s
       JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1 AND p.owner_id = $2 AND p.is_active = true`,
      [sessionId, OWNER_ID]
    );

    if (sessionRes.rowCount === 0) {
      return c.json({ ok: false, success: false, error: "Session not found or unauthorized" }, 404);
    }

    const { project_id } = sessionRes.rows[0];

    try {
      const events = await readAllSessionEvents(project_id, sessionId);
      return c.json({ ok: true, success: true, events });
    } catch (err: any) {
      if (err.message === "Missing metadata or full snapshot in replay events") {
        return c.json({
          ok: false,
          success: false,
          error: err.message,
          code: "MISSING_REPLAY_SNAPSHOT"
        }, 422);
      }
      throw err;
    }
  } catch (error) {
    console.error("Failed to read replay events:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});

