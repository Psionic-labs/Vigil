/**
 * @file github.ts
 * @description private and public API endpoints to support GitHub OAuth connection and settings.
 * @why Connects dashboard settings and issue details UI with background Octokit actions and settings persistence.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Octokit } from "octokit";
import { pool, withTransaction } from "../db";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/types";
import { encryptToken } from "../lib/token-encryption";
import { OAuthCredentialProvider } from "../lib/github-credential-provider";
import { raiseGitHubIssue } from "../lib/github-issue-service";

export const githubRouter = new Hono<AppEnv>();

const getOwnerId = (c: any) => c.get("user")!.id;

async function checkProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2 AND is_active = true`,
    [projectId, userId]
  );
  return result.rows.length > 0;
}

// ----------------------------------------------------
// PUBLIC ENDPOINTS (State JWT validation handles Auth)
// ----------------------------------------------------

githubRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.text("Bad Request: Missing code or state parameters", 400);
  }

  const secret = process.env.BETTER_AUTH_SECRET || "development_secret_key_1234567890_vigil_app";
  const dashboardUrl = process.env.VIGIL_WEB_URL || "http://localhost:3002";

  try {
    // 1. Verify and decode state JWT
    const payload = jwt.verify(state, secret) as { nonce: string; projectId: string; userId: string };

    // 2. Atomically consume nonce
    const nonceRes = await pool.query(
      `UPDATE oauth_states
       SET consumed = true
       WHERE nonce = $1
         AND consumed = false
         AND expires_at > $2
       RETURNING user_id, project_id`,
      [payload.nonce, Date.now()]
    );

    if (nonceRes.rowCount === 0) {
      return c.text("Bad Request: OAuth state expired, invalid, or already consumed", 400);
    }

    // 3. Exchange code for access token
    const clientId = process.env.GITHUB_CLIENT_ID || "placeholder_id";
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || "placeholder_secret";

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`GitHub token exchange responded with status ${tokenRes.status}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string; scope?: string; error?: string };
    if (!tokenData.access_token) {
      throw new Error(tokenData.error || "Access token missing in GitHub response");
    }

    // 4. Retrieve authenticated username
    const octokit = new Octokit({ auth: tokenData.access_token });
    const userRes = await octokit.rest.users.getAuthenticated();
    const githubUsername = userRes.data.login;

    // 5. Encrypt and save connection
    const encrypted = encryptToken(tokenData.access_token);
    const connectionId = `conn_${crypto.randomBytes(12).toString("hex")}`;
    const now = Date.now();

    await pool.query(
      `INSERT INTO github_connections (id, project_id, created_by_user_id, github_username, encrypted_token, scopes, connection_status, last_verified_at, connected_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $8)
       ON CONFLICT (project_id) DO UPDATE SET
         created_by_user_id = EXCLUDED.created_by_user_id,
         github_username = EXCLUDED.github_username,
         encrypted_token = EXCLUDED.encrypted_token,
         scopes = EXCLUDED.scopes,
         connection_status = 'active',
         last_verified_at = EXCLUDED.last_verified_at,
         updated_at = EXCLUDED.updated_at`,
      [connectionId, payload.projectId, payload.userId, githubUsername, encrypted, tokenData.scope || "repo", now, now]
    );

    // Redirect user back to dashboard settings
    return c.redirect(`${dashboardUrl}/settings?project_id=${payload.projectId}&connected=github`);
  } catch (err: any) {
    console.error("GitHub OAuth Callback Error:", err);
    return c.redirect(`${dashboardUrl}/settings?error=github_oauth_failed`);
  }
});

// ----------------------------------------------------
// PRIVATE ENDPOINTS (authMiddleware enforced)
// ----------------------------------------------------

githubRouter.use("*", authMiddleware);

githubRouter.get("/connect", async (c) => {
  const projectId = c.req.query("projectId");
  const userId = getOwnerId(c);

  if (!projectId) {
    return c.json({ ok: false, success: false, error: "Missing projectId" }, 400);
  }

  // 1. Verify project ownership
  if (!(await checkProjectOwnership(projectId, userId))) {
    return c.json({ ok: false, success: false, error: "Forbidden" }, 403);
  }

  // 2. Clean up expired nonces (older than 1 hour)
  await pool.query(
    `DELETE FROM oauth_states WHERE expires_at < $1`,
    [Date.now() - 3600000]
  );

  // 3. Generate secure nonce
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  await pool.query(
    `INSERT INTO oauth_states (nonce, user_id, project_id, created_at, expires_at, consumed)
     VALUES ($1, $2, $3, $4, $5, false)`,
    [nonce, userId, projectId, Date.now(), expiresAt]
  );

  // 4. Create signed state token
  const secret = process.env.BETTER_AUTH_SECRET || "development_secret_key_1234567890_vigil_app";
  const stateToken = jwt.sign({ nonce, projectId, userId }, secret, { expiresIn: "10m" });

  // 5. Generate redirect authorization URL
  const clientId = process.env.GITHUB_CLIENT_ID || "placeholder_id";
  const apiBaseUrl = process.env.BETTER_AUTH_URL
    ? process.env.BETTER_AUTH_URL.replace("/api/auth", "")
    : "http://localhost:3001";
  const redirectUri = `${apiBaseUrl}/api/v1/github/callback`;

  const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=repo&state=${stateToken}`;

  return c.json({ ok: true, success: true, data: { authorizeUrl } });
});

githubRouter.get("/status", async (c) => {
  const projectId = c.req.query("projectId");
  const userId = getOwnerId(c);

  if (!projectId) {
    return c.json({ ok: false, success: false, error: "Missing projectId" }, 400);
  }

  if (!(await checkProjectOwnership(projectId, userId))) {
    return c.json({ ok: false, success: false, error: "Forbidden" }, 403);
  }

  // 1. Check if user is logged in with GitHub via Better Auth accounts
  const accountRes = await pool.query(
    `SELECT 1 FROM accounts WHERE user_id = $1 AND provider_id = 'github'`,
    [userId]
  );
  const hasGithubLogin = accountRes.rows.length > 0;

  // 2. Fetch active connection
  const connRes = await pool.query(
    `SELECT id, connection_status, github_username, last_error FROM github_connections WHERE project_id = $1`,
    [projectId]
  );
  const conn = connRes.rows[0];

  if (!conn) {
    return c.json({
      ok: true,
      success: true,
      data: { connected: false, hasGithubLogin },
    });
  }

  // 3. Resolve default repo selection
  const repoRes = await pool.query(
    `SELECT full_name FROM github_repositories WHERE github_connection_id = $1 AND is_default = true`,
    [conn.id]
  );
  const defaultRepo = repoRes.rows[0]?.full_name || null;

  return c.json({
    ok: true,
    success: true,
    data: {
      connected: true,
      connectionStatus: conn.connection_status,
      githubUsername: conn.github_username,
      lastError: conn.last_error,
      repoSelected: !!defaultRepo,
      defaultRepo,
      hasGithubLogin,
    },
  });
});

githubRouter.get("/repos", async (c) => {
  const projectId = c.req.query("projectId");
  const userId = getOwnerId(c);

  if (!projectId) {
    return c.json({ ok: false, success: false, error: "Missing projectId" }, 400);
  }

  if (!(await checkProjectOwnership(projectId, userId))) {
    return c.json({ ok: false, success: false, error: "Forbidden" }, 403);
  }

  const connRes = await pool.query(
    `SELECT id FROM github_connections WHERE project_id = $1`,
    [projectId]
  );
  const conn = connRes.rows[0];
  if (!conn) {
    return c.json({ ok: false, success: false, error: "Integration not connected" }, 400);
  }

  try {
    const provider = new OAuthCredentialProvider();
    const octokit = await provider.getOctokit(conn.id);

    const reposRes = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "updated",
    });

    // Update connection verified checkpoint
    await pool.query(
      `UPDATE github_connections SET last_verified_at = $1, updated_at = $2 WHERE id = $3`,
      [Date.now(), Date.now(), conn.id]
    );

    const repos = reposRes.data.map((r) => ({
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      isPrivate: r.private,
      defaultBranch: r.default_branch,
    }));

    return c.json({ ok: true, success: true, data: repos });
  } catch (err: any) {
    console.error("Failed to list repos from GitHub:", err);
    return c.json(
      { ok: false, success: false, error: err.message || "Failed to fetch repositories from GitHub" },
      err.status || 502
    );
  }
});

const selectRepoSchema = z.object({
  projectId: z.string(),
  repoOwner: z.string(),
  repoName: z.string(),
  fullName: z.string(),
  isPrivate: z.boolean(),
  defaultBranch: z.string(),
});

githubRouter.post("/select-repo", zValidator("json", selectRepoSchema), async (c) => {
  const { projectId, repoOwner, repoName, fullName, isPrivate, defaultBranch } = c.req.valid("json");
  const userId = getOwnerId(c);

  if (!(await checkProjectOwnership(projectId, userId))) {
    return c.json({ ok: false, success: false, error: "Forbidden" }, 403);
  }

  const connRes = await pool.query(
    `SELECT id FROM github_connections WHERE project_id = $1`,
    [projectId]
  );
  const conn = connRes.rows[0];
  if (!conn) {
    return c.json({ ok: false, success: false, error: "Integration not connected" }, 400);
  }

  try {
    await withTransaction(async (client) => {
      // 1. Reset defaults on this connection
      await client.query(
        `UPDATE github_repositories
         SET is_default = false, updated_at = $1
         WHERE github_connection_id = $2`,
        [Date.now(), conn.id]
      );

      // 2. Set/insert chosen repository as default (matching the idx_one_default_repo constraint)
      const repoId = `repo_${crypto.randomBytes(12).toString("hex")}`;
      await client.query(
        `INSERT INTO github_repositories (id, github_connection_id, repo_owner, repo_name, full_name, default_branch, is_private, is_default, enabled, labels_bootstrapped, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, false, $8, $8)
         ON CONFLICT (github_connection_id, full_name) DO UPDATE SET
           is_default = true,
           default_branch = EXCLUDED.default_branch,
           is_private = EXCLUDED.is_private,
           updated_at = EXCLUDED.updated_at`,
        [repoId, conn.id, repoOwner, repoName, fullName, defaultBranch, isPrivate, Date.now()]
      );
    });

    return c.json({ ok: true, success: true });
  } catch (err: any) {
    console.error("Failed to select repo:", err);
    return c.json({ ok: false, success: false, error: "Internal Server Error" }, 500);
  }
});

githubRouter.post("/disconnect", async (c) => {
  const projectId = c.req.query("projectId");
  const userId = getOwnerId(c);

  if (!projectId) {
    return c.json({ ok: false, success: false, error: "Missing projectId" }, 400);
  }

  if (!(await checkProjectOwnership(projectId, userId))) {
    return c.json({ ok: false, success: false, error: "Forbidden" }, 403);
  }

  // Deleting connection cascades and deletes repository bindings
  await pool.query(
    `DELETE FROM github_connections WHERE project_id = $1`,
    [projectId]
  );

  return c.json({ ok: true, success: true });
});

const updateSettingsSchema = z.object({
  projectId: z.string(),
  autoRaiseEnabled: z.boolean(),
  autoRaiseSeverity: z.string(),
  autoRaiseMinConfidence: z.number(),
  commentEnabled: z.boolean(),
});

githubRouter.put("/settings", zValidator("json", updateSettingsSchema), async (c) => {
  const { projectId, autoRaiseEnabled, autoRaiseSeverity, autoRaiseMinConfidence, commentEnabled } = c.req.valid("json");
  const userId = getOwnerId(c);

  if (!(await checkProjectOwnership(projectId, userId))) {
    return c.json({ ok: false, success: false, error: "Forbidden" }, 403);
  }

  await pool.query(
    `UPDATE projects
     SET github_auto_raise_enabled = $1,
         github_auto_raise_severity = $2,
         github_auto_raise_min_confidence = $3,
         github_comment_enabled = $4
     WHERE id = $5`,
    [autoRaiseEnabled, autoRaiseSeverity, autoRaiseMinConfidence, commentEnabled, projectId]
  );

  return c.json({ ok: true, success: true });
});

const raiseSchema = z.object({
  issueGroupId: z.string(),
  projectId: z.string(),
  comment: z.string().optional(),
});

githubRouter.post("/raise", zValidator("json", raiseSchema), async (c) => {
  const { issueGroupId, projectId, comment } = c.req.valid("json");
  const userId = getOwnerId(c);

  if (!(await checkProjectOwnership(projectId, userId))) {
    return c.json({ ok: false, success: false, error: "Forbidden" }, 403);
  }

  try {
    const result = await raiseGitHubIssue({
      projectId,
      issueGroupId,
      actor: { actorType: "user", userId },
      manualComment: comment,
    });

    return c.json({ ok: true, success: true, data: result });
  } catch (err: any) {
    if (err.status === 409 || err.message?.includes("Conflict")) {
      return c.json({ ok: false, success: false, error: "An issue is already raising or linked to this group" }, 409);
    }
    return c.json(
      { ok: false, success: false, error: err.message || "Failed to raise issue on GitHub" },
      err.status || 500
    );
  }
});
