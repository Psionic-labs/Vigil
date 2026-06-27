/**
 * @file github-issue-service.ts
 * @description Manages GitHub issue reporting and follow-up synchronization.
 * @why Implements a decoupled state machine to request, process, and link GitHub issues without database transaction holding patterns.
 */
import { pool } from "../db";
import { OAuthCredentialProvider } from "./github-credential-provider";
import { getConnectionForProject, getDefaultRepository } from "./github-connection-service";
import { bootstrapLabels } from "./github-repository-service";

export type ActorContext =
  | { actorType: "user"; userId: string } // manual action, owner authorization checked
  | { actorType: "system" };              // system action (e.g. auto-raise, ignores owner authorization)

/**
 * Creates an issue on GitHub for the specified issue group.
 * Follows a safe state machine transition pattern: NULL/failed -> raising -> linked/failed.
 */
export async function raiseGitHubIssue(params: {
  projectId: string;
  issueGroupId: string;
  actor: ActorContext;
  repositoryId?: string;
  manualComment?: string;
  isAutoRaised?: boolean;
}): Promise<{ url: string; number: number }> {
  const { projectId, issueGroupId, actor, repositoryId, manualComment, isAutoRaised = false } = params;

  // 1. Authorization: Verify user ownership if user actor
  if (actor.actorType === "user") {
    const ownershipRes = await pool.query(
      `SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2 AND is_active = true`,
      [projectId, actor.userId]
    );
    if (ownershipRes.rowCount === 0) {
      const err = new Error("Forbidden: Access denied to project settings");
      (err as any).status = 403;
      throw err;
    }
  }

  // 2. Step 0: Auto-recover stale 'raising' states (> 15 minutes old) to failed
  const staleThreshold = Date.now() - 15 * 60 * 1000;
  await pool.query(
    `UPDATE issue_groups
     SET github_raise_state = 'failed', updated_at = $1
     WHERE id = $2
       AND github_raise_state = 'raising'
       AND updated_at < $3`,
    [Date.now(), issueGroupId, staleThreshold]
  );

  // 3. Transaction 1: Atomically transition state from NULL or failed -> raising (Compare-And-Swap)
  const claimRes = await pool.query(
    `UPDATE issue_groups
     SET github_raise_state = 'raising', updated_at = $1
     WHERE id = $2
       AND project_id = $3
       AND (github_raise_state IS NULL OR github_raise_state = 'failed')
       AND github_issue_url IS NULL
     RETURNING id`,
    [Date.now(), issueGroupId, projectId]
  );

  if (claimRes.rowCount === 0) {
    const err = new Error("Conflict: Issue group is already raising, linked, or does not exist");
    (err as any).status = 409;
    throw err;
  }

  // Network call boundary (no DB locks held)
  try {
    // 4. Resolve connection
    const conn = await getConnectionForProject(projectId);
    if (!conn) {
      throw new Error("GitHub integration is not connected for this project");
    }
    const connectionId = conn.id;

    // 5. Resolve repository details
    let repoRow: any = null;
    if (repositoryId) {
      const repoRes = await pool.query(
        `SELECT * FROM github_repositories WHERE id = $1 AND github_connection_id = $2`,
        [repositoryId, connectionId]
      );
      repoRow = repoRes.rows[0];
    } else {
      repoRow = await getDefaultRepository(connectionId);
    }

    if (!repoRow) {
      throw new Error("No default GitHub repository is configured for this integration");
    }

    const { id: repoId, repo_owner: repoOwner, repo_name: repoName, labels_bootstrapped: labelsBootstrapped } = repoRow;

    // 6. Instantiate Octokit client
    const credentialProvider = new OAuthCredentialProvider();
    const octokit = await credentialProvider.getOctokit(connectionId);

    // 7. Check and bootstrap repository labels if not done yet
    if (!labelsBootstrapped) {
      await bootstrapLabels({
        repositoryId: repoId,
        repoOwner,
        repoName,
        octokit,
      });
    }

    // 8. Query issue group detail data
    const issueGroupRes = await pool.query(
      `SELECT * FROM issue_groups WHERE id = $1`,
      [issueGroupId]
    );
    const issueGroup = issueGroupRes.rows[0];
    if (!issueGroup) {
      throw new Error("Issue group details not found");
    }

    // 9. Fetch latest sessions
    const sessionsRes = await pool.query(
      `SELECT s.id, s.url, s.started_at
       FROM sessions s
       JOIN issue_instances ii ON s.id = ii.session_id
       WHERE ii.issue_group_id = $1
       ORDER BY s.started_at DESC
       LIMIT 5`,
      [issueGroupId]
    );
    const sessions = sessionsRes.rows;

    let reproductionSteps: string[] = [];
    if (issueGroup.reproduction_steps_json) {
      try {
        reproductionSteps = JSON.parse(issueGroup.reproduction_steps_json);
      } catch {
        reproductionSteps = [];
      }
    }

    // 10. Generate issue description markdown body
    const vigilAppUrl = process.env.VIGIL_APP_URL || "http://localhost:3002";
    let body = `# [Vigil] ${issueGroup.title}\n\n`;

    if (manualComment) {
      body += `## User Note\n> ${manualComment}\n\n`;
    }

    body += `## Triage Summary\n`;
    body += `- **Severity**: \`${issueGroup.severity}\`\n`;
    const confidenceScore = issueGroup.confidence != null ? Number(issueGroup.confidence) : 0;
    body += `- **AI Confidence**: \`${(confidenceScore * 100).toFixed(0)}%\`\n`;
    body += `- **First Seen**: \`${new Date(Number(issueGroup.first_seen_at)).toUTCString()}\`\n`;
    body += `- **Last Seen**: \`${new Date(Number(issueGroup.last_seen_at)).toUTCString()}\`\n`;
    body += `- **Affected Sessions**: \`${issueGroup.affected_session_count}\`\n\n`;

    body += `## Root Cause Analysis\n${issueGroup.root_cause || "No root cause description available."}\n\n`;

    if (issueGroup.suggested_fix) {
      body += `## Suggested Fix\n\`\`\`typescript\n${issueGroup.suggested_fix}\n\`\`\`\n\n`;
    }

    if (reproductionSteps.length > 0) {
      body += `## Reproduction Steps\n`;
      body += reproductionSteps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join("\n") + "\n\n";
    }

    if (sessions.length > 0) {
      body += `## Affected Sessions (Latest 5)\n`;
      body += sessions
        .map(
          (s: any) =>
            `- [Session Replay Link](${vigilAppUrl}/sessions/${s.id}) (URL: \`${s.url}\`, Started: ${new Date(
              Number(s.started_at)
            ).toUTCString()})`
        )
        .join("\n") + "\n\n";
    }

    body += `---\n*Generated automatically by [Vigil](https://github.com/Psionic-labs/Vigil). Do not edit.*`;

    // 11. Prepare labels
    const labels = ["bug", "vigil-detected"];
    const severityLower = (issueGroup.severity || "P2").toLowerCase();
    labels.push(`vigil-${severityLower}`);
    if (isAutoRaised) {
      labels.push("vigil-auto-raised");
    }

    // 12. Invoke GitHub REST API to raise the issue
    const issueRes = await octokit.rest.issues.create({
      owner: repoOwner,
      repo: repoName,
      title: `[Vigil] ${issueGroup.title}`,
      body,
      labels,
    });

    const issueUrl = issueRes.data.html_url;
    const issueNumber = issueRes.data.number;

    // 13. Transaction 2: Commit results and update issue group status to linked
    await pool.query(
      `UPDATE issue_groups
       SET github_issue_url = $1,
           github_issue_number = $2,
           github_auto_raised = $3,
           github_raise_state = 'linked',
           status = 'linked',
           updated_at = $4
       WHERE id = $5 AND github_raise_state = 'raising'`,
      [issueUrl, issueNumber, isAutoRaised, Date.now(), issueGroupId]
    );

    // Record success verified timestamp on connection
    await pool.query(
      `UPDATE github_connections
       SET connection_status = 'active', last_verified_at = $1, last_error = NULL, updated_at = $2
       WHERE id = $3`,
      [Date.now(), Date.now(), connectionId]
    );

    return { url: issueUrl, number: issueNumber };
  } catch (err: any) {
    // 14. Transaction 2 (Failure): Transition back to failed state so it can be retried
    await pool.query(
      `UPDATE issue_groups
       SET github_raise_state = 'failed', updated_at = $1
       WHERE id = $2 AND github_raise_state = 'raising'`,
      [Date.now(), issueGroupId]
    );
    throw err;
  }
}

/**
 * Syncs any new sessions by posting a comment update to the existing GitHub issue.
 */
export async function postFollowUpComment(params: {
  projectId: string;
  issueGroupId: string;
}): Promise<void> {
  const { projectId, issueGroupId } = params;

  // Resolve connection and ensure it is active
  const conn = await getConnectionForProject(projectId);
  if (!conn || conn.connection_status !== "active") return;

  const repoRow = await getDefaultRepository(conn.id);
  if (!repoRow) return;

  // Load latest issue group status
  const issueGroupRes = await pool.query(
    `SELECT * FROM issue_groups WHERE id = $1`,
    [issueGroupId]
  );
  const issueGroup = issueGroupRes.rows[0];
  if (!issueGroup || !issueGroup.github_issue_number) return;

  const lastCommentSessionCount = issueGroup.github_last_comment_session_count != null
    ? Number(issueGroup.github_last_comment_session_count)
    : 0;

  const delta = Number(issueGroup.affected_session_count) - lastCommentSessionCount;
  if (delta <= 0) return;

  // Load latest sessions to link in comment
  const sessionsRes = await pool.query(
    `SELECT s.id, s.url, s.started_at
     FROM sessions s
     JOIN issue_instances ii ON s.id = ii.session_id
     WHERE ii.issue_group_id = $1
     ORDER BY s.started_at DESC
     LIMIT 5`,
    [issueGroupId]
  );
  const latestSessions = sessionsRes.rows;

  const vigilAppUrl = process.env.VIGIL_APP_URL || "http://localhost:3002";
  let body = `### 🔄 Vigil Update\n\n`;
  body += `**+${delta} new sessions** have encountered this issue (Total: **${issueGroup.affected_session_count}**).\n\n`;
  body += `#### Latest Impacted Sessions:\n`;
  body += latestSessions
    .map(
      (s: any) =>
        `- [Session Replay Link](${vigilAppUrl}/sessions/${s.id}) (URL: \`${s.url}\`, Started: ${new Date(
          Number(s.started_at)
        ).toUTCString()})`
    )
    .join("\n") + "\n\n";
  body += `---\n*Updated automatically by Vigil.*`;

  try {
    const credentialProvider = new OAuthCredentialProvider();
    const octokit = await credentialProvider.getOctokit(conn.id);

    await octokit.rest.issues.createComment({
      owner: repoRow.repo_owner,
      repo: repoRow.repo_name,
      issue_number: Number(issueGroup.github_issue_number),
      body,
    });

    // Save session checkpoint count
    await pool.query(
      `UPDATE issue_groups
       SET github_last_comment_at = $1,
           github_last_comment_session_count = $2,
           updated_at = $3
       WHERE id = $4`,
      [Date.now(), Number(issueGroup.affected_session_count), Date.now(), issueGroupId]
    );
  } catch (err) {
    console.error(`Failed to post follow-up comment for issue group ${issueGroupId}:`, err);
  }
}
