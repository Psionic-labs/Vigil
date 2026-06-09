import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { pool } from "../db";
import { generateUniqueProjectKey } from "../lib/project-key";
import type { AppEnv } from "../lib/types";

export const projectsRouter = new Hono<AppEnv>();

// Default user for milestone: Single user / Dev model
const OWNER_ID = "usr_playground";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

projectsRouter.get("/", async (c) => {
  try {
    const result = await pool.query(
      `SELECT id, name, public_key, created_at 
       FROM projects 
       WHERE owner_id = $1 
       ORDER BY created_at DESC`,
      [OWNER_ID]
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
      `SELECT id, name, public_key, created_at 
       FROM projects 
       WHERE id = $1 AND owner_id = $2`,
      [projectId, OWNER_ID]
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
      [projectId, name, publicKey, OWNER_ID, now]
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
