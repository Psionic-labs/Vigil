/**
 * @file github-credential-provider.ts
 * @description Provides Octokit instances and validates connection health for linked GitHub accounts.
 * @why Decouples OAuth connection logic from issue reporting and enables transparent rate-limit tracking and token validation.
 */
import { pool } from "../db";
import { decryptToken } from "./token-encryption";
import { Octokit } from "octokit";

export interface ConnectionHealth {
  status: "active" | "expired" | "revoked" | "rate_limited" | "error";
  scopes: string[];
  rateLimitRemaining: number | null;
  rateLimitReset: Date | null;
}

export interface GitHubCredentialProvider {
  getOctokit(connectionId: string): Promise<Octokit>;
  validateConnection(connectionId: string): Promise<ConnectionHealth>;
}

export class OAuthCredentialProvider implements GitHubCredentialProvider {
  async getOctokit(connectionId: string): Promise<Octokit> {
    const res = await pool.query(
      `SELECT encrypted_token, connection_status FROM github_connections WHERE id = $1`,
      [connectionId]
    );
    const conn = res.rows[0];
    if (!conn) {
      throw new Error(`GitHub connection ${connectionId} not found`);
    }

    let token: string;
    try {
      token = decryptToken(conn.encrypted_token);
    } catch (err: any) {
      const error = new Error(`Failed to decrypt token for connection ${connectionId}: ${err.message}`);
      (error as any).cause = err;
      throw error;
    }

    const octokit = new Octokit({ auth: token });

    // Hook into requests to intercept status/rate limit errors and update the DB state
    octokit.hook.error("request", async (error: any) => {
      const status = error.status;
      let newStatus: "active" | "expired" | "revoked" | "rate_limited" | "error" | null = null;
      const lastError = error.message || String(error);

      if (status === 401) {
        newStatus = "expired";
      } else if (status === 403) {
        const rateLimitRemaining = error.headers?.["x-ratelimit-remaining"];
        if (rateLimitRemaining === "0") {
          newStatus = "rate_limited";
        } else {
          newStatus = "revoked";
        }
      }

      if (newStatus) {
        try {
          await pool.query(
            `UPDATE github_connections
             SET connection_status = $1, last_error = $2, updated_at = $3
             WHERE id = $4`,
            [newStatus, lastError, Date.now(), connectionId]
          );
        } catch (dbErr) {
          console.error(`Failed to update connection status to ${newStatus} on error hook:`, dbErr);
        }
      }

      throw error;
    });

    return octokit;
  }

  async validateConnection(connectionId: string): Promise<ConnectionHealth> {
    try {
      const octokit = await this.getOctokit(connectionId);
      // Call GitHub API rate limit endpoint to test credentials and gather limits
      const response = await octokit.rest.rateLimit.get();

      const scopesHeader = (response.headers["x-oauth-scopes"] as string) || "";
      const scopes = scopesHeader.split(",").map((s) => s.trim()).filter(Boolean);

      const remaining = response.data.rate.remaining;
      const reset = new Date(response.data.rate.reset * 1000);

      // Connection verified as active
      await pool.query(
        `UPDATE github_connections
         SET connection_status = 'active', last_verified_at = $1, last_error = NULL, updated_at = $2
         WHERE id = $3`,
        [Date.now(), Date.now(), connectionId]
      );

      return {
        status: "active",
        scopes,
        rateLimitRemaining: remaining,
        rateLimitReset: reset,
      };
    } catch (err: any) {
      const status = err.status;
      let connectionStatus: "expired" | "revoked" | "rate_limited" | "error" = "error";
      let rateLimitReset: Date | null = null;

      if (status === 401) {
        connectionStatus = "expired";
      } else if (status === 403) {
        const rateLimitRemaining = err.headers?.["x-ratelimit-remaining"];
        if (rateLimitRemaining === "0") {
          connectionStatus = "rate_limited";
          const resetTime = err.headers?.["x-ratelimit-reset"];
          if (resetTime) {
            rateLimitReset = new Date(parseInt(resetTime, 10) * 1000);
          }
        } else {
          connectionStatus = "revoked";
        }
      }

      await pool.query(
        `UPDATE github_connections
         SET connection_status = $1, last_error = $2, updated_at = $3
         WHERE id = $4`,
        [connectionStatus, err.message || String(err), Date.now(), connectionId]
      );

      return {
        status: connectionStatus,
        scopes: [],
        rateLimitRemaining: 0,
        rateLimitReset,
      };
    }
  }
}
