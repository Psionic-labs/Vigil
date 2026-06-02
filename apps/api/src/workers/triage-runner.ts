/**
 * @file triage-runner.ts
 * @description Coordinates session eligibility, candidate lookup, prompt build, LLM call, and transactional database updates.
 * @why Separating DB connections from external network calls prevents connection pool depletion.
 *      Validating lease ownership inside database write transactions guarantees duplicate writes are avoided if processing lags.
 */

import crypto from "node:crypto";
import { pool, withTransaction } from "../db";
import { invokeModel } from "./triage-service";
import { buildTriagePrompt } from "./triage-prompts";
import { buildSessionTimeline } from "./triage/timeline";
import { findCandidateIssueGroups } from "./triage/candidate-groups";

/**
 * RunnerOptions
 * Configuration options passed by the master worker loop for job run boundaries.
 */
export interface RunnerOptions {
  workerId: string;    // Identity of the worker executing the job
  model: string;       // Model code to use
  maxAttempts: number; // Maximum attempts threshold before dead-lettering
  llmTimeoutMs: number; // Network timeout limit for the Anthropic call
}

/**
 * getBackoffMs
 * Calculates exponential retry backoffs based on attempt iteration.
 *
 * @param attempts Current attempt index.
 * @returns Cooldown duration in milliseconds (1 minute, 5 minutes, or 15 minutes).
 */
export function getBackoffMs(attempts: number): number {
  if (attempts === 1) return 60 * 1000;
  if (attempts === 2) return 300 * 1000;
  return 900 * 1000;
}

/**
 * processTriageJob
 * Main coordinator function executing session triage logic.
 *
 * @param sessionId Target session ID to analyze
 * @param projectId Project owner key
 * @param attempts Attempt count incremented by queue select query
 * @param options Configurations (worker identity, timeout limits)
 *
 * Execution Steps:
 * 1. Session Eligibility Guard: queries DB. If session is missing, not ended, or already analyzed,
 *    marks it as dead_letter directly, stopping execution.
 * 2. Retrieve Timeline Events: fetches up to 100 summary events (errors, clicks, navs) chronologically.
 * 3. Retrieve Candidate Issue Groups: finds up to 20 open candidate groups in the project matching the event fingerprints.
 * 4. Assemble Prompt: calls buildTriagePrompt to generate formatted XML prompts.
 * 5. Call LLM Service: invokes invokeModel OUTSIDE any DB transaction to prevent connection locks if Anthropic is slow.
 * 6. Transactional Persistence: enters a single DB transaction to commit outcomes:
 *     - Verifies lease ownership (status = 'leased' AND locked_by = workerId). If lost, aborts transaction.
 *     - If skipped/noise: updates session analyze flags.
 *     - If duplicate: updates Target Issue Group counters and creates issue instance.
 *     - If new issue: creates issue_groups record and creates issue instance.
 *     - Upserts ai_triage_runs log entry.
 *     - Updates triage_jobs status to 'completed'.
 */
export async function processTriageJob(
  sessionId: string,
  projectId: string,
  attempts: number,
  options: RunnerOptions
): Promise<void> {
  const { workerId, model, maxAttempts, llmTimeoutMs } = options;
  const startMonotonic = performance.now();

  try {
    // 1. Session Eligibility Guard
    const sessionRes = await pool.query(
      `
      SELECT id, url, duration_ms, started_at, release, commit_sha, environment, ended_at, ai_analyzed_at
      FROM sessions
      WHERE id = $1
      `,
      [sessionId]
    );

    const sessionRow = sessionRes.rows[0];
    if (!sessionRow) {
      // Session row does not exist -> terminal dead_letter
      await handleJobFailure(sessionId, projectId, attempts, new Error("Session row not found"), maxAttempts, workerId, "missing_session");
      return;
    }

    if (sessionRow.ended_at === null || sessionRow.ended_at === undefined) {
      // Session is not yet finalized -> terminal dead_letter (or wait for finalization)
      await handleJobFailure(sessionId, projectId, attempts, new Error("Session is not finalized"), maxAttempts, workerId, "session_not_eligible");
      return;
    }

    if (sessionRow.ai_analyzed_at !== null && sessionRow.ai_analyzed_at !== undefined) {
      // Session already analyzed in a previous execution -> terminal dead_letter
      await handleJobFailure(sessionId, projectId, attempts, new Error("Session already analyzed"), maxAttempts, workerId, "session_not_eligible");
      return;
    }

    // 2. Build Timeline (and extract fingerprints in a single pass)
    const timeline = await buildSessionTimeline(sessionId);

    // 3. Find Candidate Issue Groups using fingerprints collected during the timeline query
    const candidates = await findCandidateIssueGroups(projectId, timeline.fingerprints);

    // 4. Assemble Prompt
    const context = {
      session: {
        id: sessionRow.id,
        url: sessionRow.url,
        duration_ms: sessionRow.duration_ms,
        started_at: Number(sessionRow.started_at),
        release: sessionRow.release,
        commit_sha: sessionRow.commit_sha,
        environment: sessionRow.environment,
      },
      timeline,
      candidate_issue_groups: candidates,
    };
    const prompt = buildTriagePrompt(context);

    // 5. Call LLM Service (Outside of DB Transaction to prevent connection pool block)
    const llmResult = await invokeModel(model, prompt, { timeoutMs: llmTimeoutMs });
    const triageData = llmResult.data;

    // 6. Transactional Persistence & Lease Verification
    await withTransaction(async (client) => {
      // Lease Validation: verify status and locked_by to ensure this worker still owns the job lease.
      // FOR UPDATE locks the queue row to prevent concurrent worker reclamation during persistence writes.
      const leaseRes = await client.query(
        `
        SELECT status, locked_by 
        FROM triage_jobs 
        WHERE session_id = $1 AND status = 'leased' AND locked_by = $2 
        FOR UPDATE
        `,
        [sessionId, workerId]
      );

      if (leaseRes.rows.length === 0) {
        // Lease was stolen/expired -> abort the transaction to avoid duplicate writes.
        console.warn(
          JSON.stringify({
            level: "warn",
            workerId,
            sessionId,
            projectId,
            action: "lease_lost",
            message: "Aborted persistence because lease expired or was taken by another worker.",
          })
        );
        throw new Error("triage_lease_lost");
      }

      const updateTime = Date.now();
      const triageRunId = crypto.randomUUID();

      // Step A: Update Session metadata based on categorization choice
      const confidence = triageData.issues?.[0]?.confidence ?? triageData.friction_score / 100;
      if (!triageData.issue_detected || triageData.issue_group_action === "skipped/noise") {
        await client.query(
          `
          UPDATE sessions SET
            ai_analysis_skipped = true,
            ai_skip_reason = 'skipped/noise',
            ai_analyzed_at = $1,
            ai_session_summary = $2,
            ai_goal_completed = $3,
            ai_friction_score = $4,
            ai_triage_confidence = $5,
            updated_at = $1
          WHERE id = $6
          `,
          [
            updateTime,
            triageData.session_summary,
            triageData.goal_completed,
            triageData.friction_score,
            confidence,
            sessionId,
          ]
        );
      } else {
        // Step B: Issue detected. Determine action: Attach or Create
        let targetGroupId: string;

        if (triageData.issue_group_action === "duplicate issue group" && triageData.issue_group_id) {
          targetGroupId = triageData.issue_group_id;

          // Increment affected sessions and update last seen timestamp of existing group
          const updateRes = await client.query(
            `
            UPDATE issue_groups SET
              affected_session_count = affected_session_count + 1,
              last_seen_at = GREATEST(last_seen_at, $1),
              updated_at = $1
            WHERE id = $2 AND project_id = $3
            `,
            [updateTime, targetGroupId, projectId]
          );
          if ((updateRes.rowCount ?? 0) === 0) {
            throw new Error(`Target issue group ${targetGroupId} not found in project ${projectId}`);
          }
        } else {
          // Create new issue group
          targetGroupId = `igr_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
          const firstIssue = triageData.issues?.[0] || {
            title: "Unknown Issue",
            root_cause: "No detail provided",
            suggested_fix: "No fix provided",
            severity: "P2" as const,
            confidence: 0.5,
            reproduction_steps: [],
            evidence: [],
          };

          const primaryFp = timeline.fingerprints[0] || crypto.createHash("sha256").update(sessionId).digest("hex");

          await client.query(
            `
            INSERT INTO issue_groups (
              id, project_id, fingerprint, title, root_cause, suggested_fix,
              severity, status, confidence, reproduction_steps_json, evidence_summary,
              affected_session_count, first_seen_at, last_seen_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10, 1, $11, $11, $11, $11)
            `,
            [
              targetGroupId,
              projectId,
              primaryFp,
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
        }

        // Create issue instance record linked to the target group
        const instanceId = `inst_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
        const issueDetail = triageData.issues?.[0] || {
          title: "Session Issue Instance",
          root_cause: null,
          suggested_fix: null,
          severity: "P2",
          confidence: 0.5,
          evidence: [],
          reproduction_steps: [],
        };

        await client.query(
          `
          INSERT INTO issue_instances (
            id, issue_group_id, session_id, project_id, title, root_cause,
            suggested_fix, severity, timestamp_ms, confidence, evidence_json,
            reproduction_json, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (session_id, issue_group_id) DO NOTHING
          `,
          [
            instanceId,
            targetGroupId,
            sessionId,
            projectId,
            issueDetail.title,
            issueDetail.root_cause,
            issueDetail.suggested_fix,
            issueDetail.severity,
            Number(sessionRow.started_at),
            issueDetail.confidence,
            JSON.stringify(issueDetail.evidence),
            JSON.stringify(issueDetail.reproduction_steps),
            updateTime,
          ]
        );

        // Update session's issue counts
        await client.query(
          `
          UPDATE sessions SET
            issue_instance_count = (SELECT COUNT(*)::integer FROM issue_instances WHERE session_id = $6),
            issue_group_count = (SELECT COUNT(DISTINCT issue_group_id)::integer FROM issue_instances WHERE session_id = $6),
            ai_analyzed_at = $1,
            ai_analysis_skipped = false,
            ai_skip_reason = NULL,
            ai_session_summary = $2,
            ai_goal_completed = $3,
            ai_friction_score = $4,
            ai_triage_confidence = $5,
            updated_at = $1
          WHERE id = $6
          `,
          [
            updateTime,
            triageData.session_summary,
            triageData.goal_completed,
            triageData.friction_score,
            confidence,
            sessionId,
          ]
        );
      }

      // Step C: Log successful AI triage run
      await client.query(
        `
        INSERT INTO ai_triage_runs (
          id, session_id, project_id, model, prompt_version, status,
          input_tokens, output_tokens, error_message, created_at, completed_at
        ) VALUES ($1, $2, $3, $4, 'v1', 'completed', $5, $6, NULL, $7, $8)
        ON CONFLICT (session_id) DO UPDATE SET
          status = EXCLUDED.status,
          input_tokens = EXCLUDED.input_tokens,
          output_tokens = EXCLUDED.output_tokens,
          error_message = EXCLUDED.error_message,
          completed_at = EXCLUDED.completed_at
        `,
        [
          triageRunId,
          sessionId,
          projectId,
          model,
          llmResult.input_tokens ?? null,
          llmResult.output_tokens ?? null,
          updateTime,
          updateTime,
        ]
      );

      // Step D: Update queue job row status to completed
      await client.query(
        `
        UPDATE triage_jobs SET
          status = 'completed',
          completed_at = $1,
          updated_at = $1
        WHERE session_id = $2
        `,
        [updateTime, sessionId]
      );
    });

    // Output success logs including model tokens telemetry
    console.info(
      JSON.stringify({
        level: "info",
        workerId,
        sessionId,
        projectId,
        attempt: attempts,
        action: "db_persisted",
        durationMs: Math.round(performance.now() - startMonotonic),
        tokens: {
          input: llmResult.input_tokens ?? 0,
          output: llmResult.output_tokens ?? 0,
        },
      })
    );
  } catch (err: any) {
    if (err.message === "triage_lease_lost") {
      return; // Already handled/logged
    }
    // Handle processing/network failures and coordinate retries
    await handleJobFailure(sessionId, projectId, attempts, err, maxAttempts, workerId);
  }
}

/**
 * handleJobFailure
 * Coordinates job database status updates upon processing failure.
 *
 * @param sessionId Session job target
 * @param projectId Project owner key
 * @param attempts Attempt count incremented in the current lease cycle
 * @param error Target exception thrown
 * @param maxAttempts Attempts capacity limit config
 * @param overrideReason Optional force-dead_letter reason code
 *
 * How it works:
 * 1. Checks if failure is terminal (overrideReason defined or attempts >= maxAttempts).
 * 2. If terminal: updates triage_jobs status to 'dead_letter'. Emits an error level JSON log to stderr.
 * 3. If retryable: calculates backoff cooldown, updates triage_jobs status to 'failed' and sets next_attempt_at.
 *    Emits a warn level JSON log.
 * 4. Inserts a failed run log entry into ai_triage_runs.
 */
async function handleJobFailure(
  sessionId: string,
  projectId: string,
  attempts: number,
  error: Error,
  maxAttempts: number,
  workerId: string,
  overrideReason?: string
): Promise<void> {
  const now = Date.now();
  const isDeadLetter = overrideReason !== undefined || attempts >= maxAttempts;
  const reason = overrideReason || (attempts >= maxAttempts ? "max_attempts_reached" : "triage_failed");

  try {
    await withTransaction(async (client) => {
      let leaseValid = true;

      if (isDeadLetter) {
        // Move status to dead_letter
        const res = await client.query(
          `
          UPDATE triage_jobs SET
            status = 'dead_letter',
            failed_at = $1,
            last_error = $2,
            updated_at = $1
          WHERE session_id = $3 AND status = 'leased' AND locked_by = $4
          `,
          [now, error.message, sessionId, workerId]
        );
        if (res && (res.rowCount ?? 0) === 0) {
          leaseValid = false;
        }
      } else {
        // Increment attempts, set status to failed, and schedule backoff delay
        const backoffMs = getBackoffMs(attempts);
        const nextAttemptAt = now + backoffMs;

        const res = await client.query(
          `
          UPDATE triage_jobs SET
            status = 'failed',
            next_attempt_at = $1,
            last_error = $2,
            updated_at = $3
          WHERE session_id = $4 AND status = 'leased' AND locked_by = $5
          `,
          [nextAttemptAt, error.message, now, sessionId, workerId]
        );
        if (res && (res.rowCount ?? 0) === 0) {
          leaseValid = false;
        }
      }

      if (!leaseValid) {
        console.warn(`[TriageRunner] Failed to transition job ${sessionId} to failed/dead_letter because lease was lost.`);
        return;
      }

      // Record failed run inside ai_triage_runs (upsert)
      const runId = crypto.randomUUID();
      await client.query(
        `
        INSERT INTO ai_triage_runs (
          id, session_id, project_id, model, prompt_version, status,
          input_tokens, output_tokens, error_message, created_at, completed_at
        ) VALUES ($1, $2, $3, 'unknown', 'v1', 'failed', NULL, NULL, $4, $5, $5)
        ON CONFLICT (session_id) DO UPDATE SET
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          completed_at = EXCLUDED.completed_at
        `,
        [runId, sessionId, projectId, error.message, now]
      );
    });

    if (isDeadLetter) {
      console.error(
        JSON.stringify({
          level: "error",
          action: "dead_letter",
          workerId: process.env.WORKER_ID || "unknown",
          sessionId,
          jobId: sessionId,
          attempts,
          reason,
          message: error.message,
        })
      );
    } else {
      console.warn(
        JSON.stringify({
          level: "warn",
          action: "retry_scheduled",
          workerId: process.env.WORKER_ID || "unknown",
          sessionId,
          attempts,
          message: error.message,
          nextAttemptAt: now + getBackoffMs(attempts),
        })
      );
    }
  } catch (dbErr) {
    console.error("Critical failure updating triage_jobs failure state in database", dbErr);
  }
}
