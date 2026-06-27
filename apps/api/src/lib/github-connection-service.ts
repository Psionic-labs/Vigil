/**
 * @file github-connection-service.ts
 * @description Connection loader and validator service.
 * @why Centralizes the validation of user project access and connection details before interacting with GitHub.
 */
import { pool } from "../db";

/**
 * Validates that the user has permission to manage the project.
 * Throws an error if validation fails.
 */
export async function validateProjectOwnership(projectId: string, userId: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2 AND is_active = true`,
    [projectId, userId]
  );
  if (result.rowCount === 0) {
    const err = new Error("Forbidden: Access denied to project settings");
    (err as any).status = 403;
    throw err;
  }
}

/**
 * Loads the GitHub connection row for a project.
 */
export async function getConnectionForProject(projectId: string) {
  const result = await pool.query(
    `SELECT * FROM github_connections WHERE project_id = $1`,
    [projectId]
  );
  return result.rows[0] || null;
}

/**
 * Resolves the default GitHub repository linked to a connection.
 */
export async function getDefaultRepository(connectionId: string) {
  const result = await pool.query(
    `SELECT * FROM github_repositories WHERE github_connection_id = $1 AND is_default = true`,
    [connectionId]
  );
  return result.rows[0] || null;
}
