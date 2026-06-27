/**
 * @file github-repository-service.ts
 * @description Repository configuration and metadata management service.
 * @why Controls the repository lifecycle, selection constraints, and idempotent setup of required labels.
 */
import { pool } from "../db";
import type { Octokit } from "octokit";

export const TARGET_LABELS = [
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  { name: "vigil-detected", color: "5319e7", description: "Issues auto-detected by Vigil" },
  { name: "vigil-auto-raised", color: "0052cc", description: "Automatically raised by Vigil" },
  { name: "vigil-p0", color: "b60205", description: "Critical Severity Issue (P0)" },
  { name: "vigil-p1", color: "e99695", description: "High Severity Issue (P1)" },
  { name: "vigil-p2", color: "fef2c0", description: "Medium Severity Issue (P2)" },
  { name: "vigil-p3", color: "c5def5", description: "Low Severity Issue (P3)" },
];

/**
 * Bootstraps standard Vigil labels in the target repository.
 * Swallows 422 (already exists) errors to make the action idempotent.
 */
export async function bootstrapLabels(params: {
  repositoryId: string;
  repoOwner: string;
  repoName: string;
  octokit: Octokit;
}): Promise<void> {
  const { repositoryId, repoOwner, repoName, octokit } = params;

  for (const label of TARGET_LABELS) {
    try {
      await octokit.rest.issues.createLabel({
        owner: repoOwner,
        repo: repoName,
        name: label.name,
        color: label.color,
        description: label.description,
      });
    } catch (err: any) {
      // 422 status indicates the label already exists; we swallow it.
      if (err.status !== 422) {
        throw err;
      }
    }
  }

  // Update DB flag so we skip subsequent full runs unless reset manually
  await pool.query(
    `UPDATE github_repositories
     SET labels_bootstrapped = true, updated_at = $1
     WHERE id = $2`,
    [Date.now(), repositoryId]
  );
}
