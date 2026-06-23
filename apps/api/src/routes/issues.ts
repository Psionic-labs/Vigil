/**
 * @file issues.ts
 * @description Dashboard API routes for retrieving project issue groups and details.
 * @why Enables the developer dashboard to query aggregated and triaged issue groups.
 */

import { Hono } from "hono";
import { pool } from "../db";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/types";

export const issuesRouter = new Hono<AppEnv>();
issuesRouter.use("*", authMiddleware);

const getOwnerId = (c: any) => c.get("user")!.id;

function mapIssueGroupRow(row: any) {
  let reproductionSteps: string[] = [];
  if (row.reproduction_steps_json) {
    try {
      reproductionSteps = JSON.parse(row.reproduction_steps_json);
    } catch {
      reproductionSteps = [];
    }
  }

  let evidence: any[] = [];
  if (row.evidence_summary) {
    try {
      evidence = JSON.parse(row.evidence_summary);
    } catch {
      evidence = [];
    }
  }

  return {
    id: row.id,
    title: row.title,
    root_cause: row.root_cause || "",
    suggested_fix: row.suggested_fix || "",
    severity: row.severity,
    status: row.status,
    confidence: row.confidence != null ? Number(row.confidence) : 0,
    affected_session_count: Number(row.affected_session_count || 0),
    first_seen_at: Number(row.first_seen_at),
    last_seen_at: Number(row.last_seen_at),
    github_issue_url: row.github_issue_url || null,
    github_issue_number: row.github_issue_number != null ? Number(row.github_issue_number) : null,
    github_auto_raised: Boolean(row.github_auto_raised),
    reproduction_steps: reproductionSteps,
    evidence: evidence,
  };
}

// GET /api/v1/issues?projectId=...
issuesRouter.get("/", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ ok: false, success: false, error: "Missing projectId" }, 400);
    }

    // 1. Verify project ownership and active status
    const projectCheck = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND owner_id = $2 AND is_active = true`,
      [projectId, getOwnerId(c)]
    );

    if (projectCheck.rowCount === 0) {
      return c.json({ ok: false, success: false, error: "Project not found or unauthorized" }, 404);
    }

    // 2. Query issue groups
    const result = await pool.query(
      `SELECT id, title, root_cause, suggested_fix, severity, status, confidence,
              reproduction_steps_json, evidence_summary, affected_session_count,
              first_seen_at, last_seen_at, github_issue_url, github_issue_number, github_auto_raised
       FROM issue_groups
       WHERE project_id = $1
       ORDER BY 
         CASE severity
           WHEN 'P0' THEN 1
           WHEN 'P1' THEN 2
           WHEN 'P2' THEN 3
           WHEN 'P3' THEN 4
           ELSE 5
         END ASC,
         last_seen_at DESC`,
      [projectId]
    );

    const data = result.rows.map(mapIssueGroupRow);

    return c.json({ ok: true, success: true, data });
  } catch (error) {
    console.error("Failed to list issues:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});

// GET /api/v1/issues/:id
issuesRouter.get("/:id", async (c) => {
  try {
    const issueId = c.req.param("id");

    // 1. Verify project ownership of the issue group by joining with projects
    const result = await pool.query(
      `SELECT ig.id, ig.project_id, ig.title, ig.root_cause, ig.suggested_fix, ig.severity,
              ig.status, ig.confidence, ig.reproduction_steps_json, ig.evidence_summary,
              ig.affected_session_count, ig.first_seen_at, ig.last_seen_at,
              ig.github_issue_url, ig.github_issue_number, ig.github_auto_raised
       FROM issue_groups ig
       JOIN projects p ON ig.project_id = p.id
       WHERE ig.id = $1 AND p.owner_id = $2 AND p.is_active = true`,
      [issueId, getOwnerId(c)]
    );

    if (result.rowCount === 0) {
      return c.json({ ok: false, success: false, error: "Issue not found or unauthorized" }, 404);
    }

    const row = result.rows[0];

    // 2. Fetch affected sessions
    const sessionsResult = await pool.query(
      `SELECT s.id, s.url, s.ai_goal_completed, s.started_at
       FROM sessions s
       JOIN issue_instances ii ON s.id = ii.session_id
       WHERE ii.issue_group_id = $1
       ORDER BY s.started_at DESC
       LIMIT 5`,
      [issueId]
    );

    const issueDetail = {
      ...mapIssueGroupRow(row),
      project_id: row.project_id,
      affectedSessions: sessionsResult.rows.map((s) => ({
        id: s.id,
        url: s.url,
        ai_goal_completed: s.ai_goal_completed != null ? Boolean(s.ai_goal_completed) : false,
        started_at: Number(s.started_at),
      })),
    };

    return c.json({ ok: true, success: true, data: issueDetail });
  } catch (error) {
    console.error("Failed to get issue details:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});
