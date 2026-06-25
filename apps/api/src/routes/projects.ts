/**
 * @file projects.ts
 * @description Private routing to manage project creation, update, and deletion settings.
 * @why Enables dashboard UI interactions for project administration.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { pool } from "../db";
import { generateUniqueProjectKey } from "../lib/project-key";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/types";

export const projectsRouter = new Hono<AppEnv>();
projectsRouter.use("*", authMiddleware);

// Default user for milestone: Single user / Dev model
const getOwnerId = (c: any) => c.get("user")!.id;

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

projectsRouter.get("/", async (c) => {
  try {
    const result = await pool.query(
      `SELECT id, name, public_key, created_at 
       FROM projects 
       WHERE owner_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [getOwnerId(c)]
    );

    const projects = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      publicKey: row.public_key,
      createdAt: Number(row.created_at),
    }));

    return c.json({ ok: true, success: true, data: projects });
  } catch (error) {
    console.error("Failed to list projects:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});

projectsRouter.get("/:id", async (c) => {
  try {
    const projectId = c.req.param("id");
    const result = await pool.query(
      `SELECT id, name, public_key, created_at,
              github_auto_raise_enabled, github_auto_raise_severity,
              github_auto_raise_min_confidence, github_comment_enabled
       FROM projects 
       WHERE id = $1 AND owner_id = $2 AND is_active = true`,
      [projectId, getOwnerId(c)]
    );

    if (result.rowCount === 0) {
      return c.json({ ok: false, success: false, error: "Not Found" }, 404);
    }

    const row = result.rows[0];
    const project = {
      id: row.id,
      name: row.name,
      publicKey: row.public_key,
      createdAt: Number(row.created_at),
      githubAutoRaiseEnabled: Boolean(row.github_auto_raise_enabled),
      githubAutoRaiseSeverity: row.github_auto_raise_severity,
      githubAutoRaiseMinConfidence: Number(row.github_auto_raise_min_confidence),
      githubCommentEnabled: Boolean(row.github_comment_enabled),
    };

    return c.json({ ok: true, success: true, data: project });
  } catch (error) {
    console.error("Failed to get project:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});

projectsRouter.post("/", zValidator("json", createProjectSchema), async (c) => {
  const { name } = c.req.valid("json");
  const now = Date.now();

  try {
    const publicKey = await generateUniqueProjectKey(pool);
    // Simple id generation for project
    const projectId = `proj_${Math.random().toString(36).substring(2, 9)}${Date.now().toString(36)}`;

    await pool.query(
      `INSERT INTO projects (id, name, public_key, owner_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [projectId, name, publicKey, getOwnerId(c), now]
    );

    return c.json({
      ok: true,
      success: true,
      data: {
        id: projectId,
        name,
        publicKey,
        createdAt: now,
      },
    });
  } catch (error) {
    console.error("Failed to create project:", error);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});
