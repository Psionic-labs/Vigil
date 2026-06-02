/**
 * @file candidate-groups.ts
 * @description Retrieves open issue group candidates that match the fingerprints of a session's errors.
 * @why Enables the LLM to deduplicate issues by linking new session errors to existing open issues.
 */

import { pool } from "../../db";
import type { CandidateIssueGroup } from "../triage-types";

/**
 * findCandidateIssueGroups
 * Queries the database for open issue groups matching the fingerprints of session events.
 *
 * @param projectId Target scope project key.
 * @param fingerprints List of session event error fingerprints.
 */
export async function findCandidateIssueGroups(
  projectId: string,
  fingerprints: string[]
): Promise<CandidateIssueGroup[]> {
  // Filter out empty strings/nulls, keeping duplicates to calculate session frequency
  const validFingerprints = fingerprints.filter(Boolean);

  // Short-circuit: If no fingerprints exist, no issue groups can match. Bypasses the database call.
  if (validFingerprints.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
    WITH session_fps AS (
      SELECT fp, COUNT(*) AS freq
      FROM unnest($2::text[]) AS fp
      GROUP BY fp
    )
    SELECT
      ig.id,
      ig.title,
      ig.fingerprint,
      ig.severity,
      ig.status,
      ig.last_seen_at
    FROM issue_groups ig
    JOIN session_fps sf ON ig.fingerprint = sf.fp
    WHERE ig.project_id = $1
    AND ig.status = 'open'
    ORDER BY
      sf.freq DESC,
      CASE ig.severity
        WHEN 'P0' THEN 1
        WHEN 'P1' THEN 2
        WHEN 'P2' THEN 3
        WHEN 'P3' THEN 4
        ELSE 5
      END ASC,
      ig.last_seen_at DESC
    LIMIT 20;
    `,
    [projectId, validFingerprints]
  );

  // Map database snake_case fields to camelCase properties for consistency
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    fingerprint: row.fingerprint,
    severity: row.severity,
    lastSeenAt: Number(row.last_seen_at)
  }));
}
