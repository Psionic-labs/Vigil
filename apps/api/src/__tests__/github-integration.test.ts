/**
 * @file github-integration.test.ts
 * @description Integration and unit tests for GitHub integration features.
 * @why Verifies OAuth token encryption security, state machine transitions, crash recovery logic, and default repository constraints.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import { encryptToken, decryptToken, getEncryptionKeyOrThrow } from "../lib/token-encryption";
import crypto from "crypto";

describe("GitHub Integration Integration Tests", () => {
  // Test Encryption round-trip
  describe("Token Encryption Service", () => {
    const originalKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

    beforeAll(() => {
      if (!process.env.GITHUB_TOKEN_ENCRYPTION_KEY) {
        process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "mock_secret_key_for_testing_purposes";
      }
    });

    afterAll(() => {
      process.env.GITHUB_TOKEN_ENCRYPTION_KEY = originalKey;
    });

    it("should encrypt and decrypt a token correctly", () => {
      const originalToken = "gho_testToken1234567890abcdef";
      const encrypted = encryptToken(originalToken);
      expect(encrypted).toContain("ciphertext");
      expect(encrypted).toContain("iv");
      expect(encrypted).toContain("tag");
      expect(encrypted).toContain("version");

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(originalToken);
    });

    it("should throw if GITHUB_TOKEN_ENCRYPTION_KEY is missing", () => {
      delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
      expect(() => getEncryptionKeyOrThrow()).toThrow();
    });
  });

  const databaseUrl = process.env.DATABASE_URL || "";
  const hasRealDb = /^postgres(ql)?:\/\//i.test(databaseUrl) && !databaseUrl.endsWith("//fake");

  if (!hasRealDb) {
    describe.skip("Database State-Machine & Constraints Tests", () => {
      it("skipped — no DATABASE_URL configured", () => {});
    });
  } else {
    describe("Database State-Machine & Constraints Tests", () => {
      const runSuffix = Math.random().toString(36).substring(2, 10);
      const TEST_PROJECT_ID = `proj_gh_${runSuffix}`;
      const TEST_USER_ID = `usr_gh_${runSuffix}`;
      const TEST_CONNECTION_ID = `conn_gh_${runSuffix}`;

      beforeAll(async () => {
        // Clean up and seed user & project
        await pool.query("DELETE FROM github_repositories WHERE github_connection_id IN (SELECT id FROM github_connections WHERE project_id = $1)", [TEST_PROJECT_ID]);
        await pool.query("DELETE FROM github_connections WHERE project_id = $1", [TEST_PROJECT_ID]);
        await pool.query("DELETE FROM oauth_states WHERE project_id = $1", [TEST_PROJECT_ID]);
        await pool.query("DELETE FROM issue_groups WHERE project_id = $1", [TEST_PROJECT_ID]);
        await pool.query("DELETE FROM projects WHERE id = $1", [TEST_PROJECT_ID]);

        await pool.query(
          `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
           VALUES ($1, 'GitHub Test User', $2, true, $3, $3)
           ON CONFLICT (id) DO NOTHING`,
          [TEST_USER_ID, `usr_gh_test_${runSuffix}@vigil.run`, new Date()]
        );

        await pool.query(
          `INSERT INTO projects (id, name, public_key, owner_id, is_active, created_at)
           VALUES ($1, 'GitHub Test Project', $2, $3, true, $4)`,
          [TEST_PROJECT_ID, `pk_gh_${runSuffix}`, TEST_USER_ID, Date.now()]
        );

        // Seed connection
        await pool.query(
          `INSERT INTO github_connections (id, project_id, created_by_user_id, github_username, encrypted_token, scopes, connection_status, connected_at, updated_at)
           VALUES ($1, $2, $3, 'gh-test-user', 'mock-encrypted-token', 'repo', 'active', $4, $4)`,
          [TEST_CONNECTION_ID, TEST_PROJECT_ID, TEST_USER_ID, Date.now()]
        );
      });

      afterAll(async () => {
        await pool.query("DELETE FROM github_repositories WHERE github_connection_id = $1", [TEST_CONNECTION_ID]);
        await pool.query("DELETE FROM github_connections WHERE id = $1", [TEST_CONNECTION_ID]);
        await pool.query("DELETE FROM oauth_states WHERE project_id = $1", [TEST_PROJECT_ID]);
        await pool.query("DELETE FROM issue_groups WHERE project_id = $1", [TEST_PROJECT_ID]);
        await pool.query("DELETE FROM projects WHERE id = $1", [TEST_PROJECT_ID]);
      });

      // 1. Atomic Nonce Consumption Test
      it("should atomically consume an OAuth nonce and prevent double spend", async () => {
        const nonce = `nonce_${crypto.randomBytes(8).toString("hex")}`;
        const expiresAt = Date.now() + 600000; // 10 mins

        // Insert nonce
        await pool.query(
          `INSERT INTO oauth_states (nonce, user_id, project_id, created_at, expires_at, consumed)
           VALUES ($1, $2, $3, $4, $5, false)`,
          [nonce, TEST_USER_ID, TEST_PROJECT_ID, Date.now(), expiresAt]
        );

        // Attempt 1: consume it
        const res1 = await pool.query(
          `UPDATE oauth_states
           SET consumed = true
           WHERE nonce = $1
             AND consumed = false
             AND expires_at > $2
           RETURNING user_id, project_id`,
          [nonce, Date.now()]
        );

        expect(res1.rowCount).toBe(1);
        expect(res1.rows[0].user_id).toBe(TEST_USER_ID);
        expect(res1.rows[0].project_id).toBe(TEST_PROJECT_ID);

        // Attempt 2: double spend (should fail)
        const res2 = await pool.query(
          `UPDATE oauth_states
           SET consumed = true
           WHERE nonce = $1
             AND consumed = false
             AND expires_at > $2
           RETURNING user_id, project_id`,
          [nonce, Date.now()]
        );

        expect(res2.rowCount).toBe(0);
      });

      // 2. Default Repository unique index check
      it("should enforce exactly one default repository per connection", async () => {
        const repoId1 = `repo_1_${runSuffix}`;
        const repoId2 = `repo_2_${runSuffix}`;

        // Insert first default repo (should succeed)
        await pool.query(
          `INSERT INTO github_repositories (id, github_connection_id, repo_owner, repo_name, full_name, is_default, enabled, created_at, updated_at)
           VALUES ($1, $2, 'test-owner', 'repo-1', 'test-owner/repo-1', true, true, $3, $3)`,
          [repoId1, TEST_CONNECTION_ID, Date.now()]
        );

        // Try inserting second default repo (should fail on unique constraint idx_one_default_repo)
        await expect(
          pool.query(
            `INSERT INTO github_repositories (id, github_connection_id, repo_owner, repo_name, full_name, is_default, enabled, created_at, updated_at)
             VALUES ($1, $2, 'test-owner', 'repo-2', 'test-owner/repo-2', true, true, $3, $3)`,
            [repoId2, TEST_CONNECTION_ID, Date.now()]
          )
        ).rejects.toThrow();

        // Cleanup first repo
        await pool.query("DELETE FROM github_repositories WHERE id = $1", [repoId1]);
      });

      // 3. Issue raising state machine checks
      it("should verify raising state machine transitions and stale recovery", async () => {
        const issueGroupId = `igr_test_${runSuffix}`;

        // Seed issue group with NULL raise state
        await pool.query(
          `INSERT INTO issue_groups (id, project_id, fingerprint, title, root_cause, suggested_fix, severity, status, confidence, affected_session_count, first_seen_at, last_seen_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'Test Error title', 'root cause', 'fix', 'P1', 'open', 0.9, 1, $4, $4, $4, $4)`,
          [issueGroupId, TEST_PROJECT_ID, `fp_gh_${runSuffix}`, Date.now()]
        );

        // Claim transition (NULL -> raising)
        const claimRes = await pool.query(
          `UPDATE issue_groups SET
             github_raise_state = 'raising',
             updated_at = $1
           WHERE id = $2
             AND project_id = $3
             AND (github_raise_state IS NULL OR github_raise_state = 'failed')
             AND github_issue_url IS NULL
           RETURNING id`,
          [Date.now(), issueGroupId, TEST_PROJECT_ID]
        );
        expect(claimRes.rowCount).toBe(1);

        // Double claim (should fail)
        const doubleClaimRes = await pool.query(
          `UPDATE issue_groups SET
             github_raise_state = 'raising',
             updated_at = $1
           WHERE id = $2
             AND project_id = $3
             AND (github_raise_state IS NULL OR github_raise_state = 'failed')
             AND github_issue_url IS NULL
           RETURNING id`,
          [Date.now(), issueGroupId, TEST_PROJECT_ID]
        );
        expect(doubleClaimRes.rowCount).toBe(0);

        // Recover stale claim (backdate updated_at by 20 minutes)
        const staleTime = Date.now() - 20 * 60 * 1000;
        await pool.query(
          `UPDATE issue_groups SET updated_at = $1 WHERE id = $2`,
          [staleTime, issueGroupId]
        );

        // Run recovery query
        const recoverRes = await pool.query(
          `UPDATE issue_groups SET
             github_raise_state = 'failed',
             updated_at = $1
           WHERE id = $2
             AND github_raise_state = 'raising'
             AND updated_at < $3
           RETURNING id`,
          [Date.now(), issueGroupId, Date.now() - 15 * 60 * 1000]
        );
        expect(recoverRes.rowCount).toBe(1);

        // Now claim should succeed again (failed -> raising)
        const reclaimRes = await pool.query(
          `UPDATE issue_groups SET
             github_raise_state = 'raising',
             updated_at = $1
           WHERE id = $2
             AND project_id = $3
             AND (github_raise_state IS NULL OR github_raise_state = 'failed')
             AND github_issue_url IS NULL
           RETURNING id`,
          [Date.now(), issueGroupId, TEST_PROJECT_ID]
        );
        expect(reclaimRes.rowCount).toBe(1);
      });
    });
  }
});
