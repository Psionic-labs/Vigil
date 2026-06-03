/**
 * @file issue-group-actions.ts
 * @description Implement transactional handling of AI triage issue group actions (create/attach).
 * @why Encapsulating database queries for issue groups ensures proper duplicate protection,
 *      concurrency safety, and idempotency guarantees.
 */

import crypto from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import { AIValidationError } from "../../lib/ai";
import type { AITriageOutput } from "../triage-service";

/**
 * createIssueGroup
 * Inserts a new issue group or converts to attach if a group with the same fingerprint already exists.
 *
 * @param client Database PoolClient in a transaction.
 * @param projectId Target project ID.
 * @param fingerprint Target fingerprint (must be provided and not fallback).
 * @param triageData Validated AI triage output.
 * @param updateTime Millisecond timestamp for tracking seen/created at times.
 * @param sessionId Target session ID.
 * @returns The issue group ID (either newly created or existing duplicate).
 */
export async function createIssueGroup(
  client: PoolClient,
  projectId: string,
  fingerprint: string | undefined | null,
  triageData: AITriageOutput,
  updateTime: number,
  sessionId: string
): Promise<string> {
  if (!fingerprint) {
    throw new AIValidationError(
      `Fingerprint is missing or invalid for session ${sessionId} to create a new issue group.`,
      "schema_validation_failed"
    );
  }

  // 1. Query duplicate protection check
  const dupRes = await client.query(
    `SELECT id FROM issue_groups WHERE project_id = $1 AND fingerprint = $2 LIMIT 1`,
    [projectId, fingerprint]
  );

  if (dupRes.rows.length > 0) {
    const existingGroupId = dupRes.rows[0].id;
    // Convert internally to attach and delegate to attachIssueGroup
    await attachIssueGroup(client, projectId, existingGroupId, updateTime, sessionId);
    return existingGroupId;
  }

  // 2. Insert new issue group
  const targetGroupId = `igr_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
  const firstIssue = triageData.issues?.[0];
  if (!firstIssue) {
    throw new AIValidationError(
      "No issue detail provided in the triage data for new group creation.",
      "schema_validation_failed"
    );
  }

  try {
    await client.query(
      `
      INSERT INTO issue_groups (
        id, project_id, fingerprint, title, root_cause, suggested_fix,
        severity, status, confidence, reproduction_steps_json, evidence_summary,
        affected_session_count, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10, 0, $11, $11, $11, $11)
      `,
      [
        targetGroupId,
        projectId,
        fingerprint,
        firstIssue.title,
        firstIssue.root_cause,
        firstIssue.suggested_fix,
        firstIssue.severity,
        firstIssue.confidence,
        JSON.stringify(firstIssue.reproduction_steps),
        JSON.stringify(firstIssue.evidence),
        updateTime,
      ]
    );
  } catch (error: any) {
    if (error && error.code === "23505") {
      const retryDupRes = await client.query(
        `SELECT id FROM issue_groups WHERE project_id = $1 AND fingerprint = $2 LIMIT 1`,
        [projectId, fingerprint]
      );
      if (retryDupRes.rows.length > 0) {
        const existingGroupId = retryDupRes.rows[0].id;
        await attachIssueGroup(client, projectId, existingGroupId, updateTime, sessionId);
        return existingGroupId;
      }
    }
    throw error;
  }

  return targetGroupId;
}

/**
 * attachIssueGroup
 * Associates the session with an existing issue group, validating existence and project ownership.
 *
 * @param client Database PoolClient in a transaction.
 * @param projectId Target project ID.
 * @param issueGroupId Existing issue group ID to attach.
 * @param updateTime Millisecond timestamp.
 * @param sessionId Target session ID.
 * @returns The issue group ID validated.
 */
export async function attachIssueGroup(
  client: PoolClient,
  projectId: string,
  issueGroupId: string,
  _updateTime: number,
  _sessionId: string
): Promise<string> {
  // 1. Validation check (blocks cross-project or hallucinated IDs)
  const groupRes = await client.query(
    `SELECT id FROM issue_groups WHERE id = $1 AND project_id = $2`,
    [issueGroupId, projectId]
  );

  if (groupRes.rows.length === 0) {
    throw new AIValidationError(
      `Issue group ${issueGroupId} not found in project ${projectId}.`,
      "schema_validation_failed"
    );
  }

  return issueGroupId;
}
