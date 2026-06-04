/**
 * @file triage-runner.ts
 * @description Coordinates session eligibility, candidate lookup, prompt build, LLM call, and transactional database updates.
 * @why Separating DB connections from external network calls prevents connection pool depletion.
 *      Validating lease ownership inside database write transactions guarantees duplicate writes are avoided if processing lags.
 */

import crypto from "node:crypto";
import { pool, withTransaction } from "../db";
import { type AIProvider, AIValidationError, getRawOutput, extractAndValidateJSON } from "../lib/ai";
import { buildTriagePrompt } from "./triage-prompts";
import { buildSessionTimeline } from "./triage/timeline";
import { findCandidateIssueGroups } from "./triage/candidate-groups";
import { buildRepairPrompt } from "./triage/repair-prompt";
import { createIssueGroup, attachIssueGroup } from "./triage/issue-group-actions";

/**
 * RunnerOptions
 * Configuration options passed by the master worker loop for job run boundaries.
 */
export interface RunnerOptions {
  workerId: string;    // Identity of the worker executing the job
  provider: AIProvider; // Provider-agnostic LLM client (configured with model, timeout, etc.)
  maxAttempts: number; // Maximum attempts threshold before dead-lettering
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
 * 5. Call LLM Service: invokes provider.invoke() OUTSIDE any DB transaction to prevent connection locks if the LLM is slow.
 * 6. Transactional Persistence: enters a single DB transaction to commit outcomes:
 *     - Verifies lease ownership (status = 'leased' AND locked_by = workerId). If lost, aborts transaction.
 *     - If skipped/noise: updates session analyze flags.
 *     - If duplicate: updates Target Issue Group counters and creates issue instance.
 *     - If new issue: creates issue_groups record and creates issue instance.
 *     - Upserts ai_triage_runs log entry.
 *     - Updates triage_jobs status to 'completed'.
 */
/**
 * handleJobSkip
 * Records a skipped run in ai_triage_runs and completes the queue job inside a transaction.
 */
async function handleJobSkip(
  sessionId: string,
  projectId: string,
  reason: string,
  workerId: string,
  startMonotonic: number
): Promise<void> {
  const now = Date.now();
  const durationMs = Math.round(performance.now() - startMonotonic);
  try {
    await withTransaction(async (client) => {
      // 1. Complete queue job
      const res = await client.query(
        `
        UPDATE triage_jobs SET
          status = 'completed',
          completed_at = $1,
          updated_at = $1
        WHERE session_id = $2 AND status = 'leased' AND locked_by = $3
        `,
        [now, sessionId, workerId]
      );

      if (res && (res.rowCount ?? 0) === 0) {
        throw new Error("triage_lease_lost");
      }

      // 2. Record skipped run inside ai_triage_runs
      const runId = crypto.randomUUID();
      await client.query(
        `
        INSERT INTO ai_triage_runs (
          id, session_id, project_id, model, prompt_version, status,
          input_tokens, output_tokens, error_message, error_type,
          attempt_number, failure_stage, job_id, repair_count, created_at, completed_at, duration_ms, updated_at
        ) VALUES ($1, $2, $3, 'none', 'v1', 'skipped', 0, 0, $4, NULL, 0, NULL, $2, 0, $5, $5, $6, $5)
        ON CONFLICT (session_id) DO UPDATE SET
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          completed_at = EXCLUDED.completed_at,
          duration_ms = EXCLUDED.duration_ms,
          updated_at = EXCLUDED.updated_at
        `,
        [runId, sessionId, projectId, reason, now, durationMs]
      );
    });

    console.info(
      JSON.stringify({
        level: "info",
        action: "triage_completed",
        sessionId,
        status: "skipped",
      })
    );
  } catch (err: any) {
    if (err.message === "triage_lease_lost") {
      console.warn(`[TriageRunner] Failed to transition job ${sessionId} to completed (skip) because lease was lost.`);
      return;
    }
    console.error("Critical failure updating triage_jobs skip state in database", err);
    throw err;
  }
}

export async function processTriageJob(
  sessionId: string,
  projectId: string,
  attempts: number,
  options: RunnerOptions
): Promise<void> {
  const { workerId, provider, maxAttempts } = options;
  const startMonotonic = performance.now();
  const jobId = sessionId;

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
      await handleJobFailure(sessionId, projectId, attempts, new Error("Session row not found"), maxAttempts, workerId, "missing_session", startMonotonic);
      return;
    }

    if (sessionRow.ended_at === null || sessionRow.ended_at === undefined) {
      // Session is not yet finalized -> record skipped run
      await handleJobSkip(sessionId, projectId, "session_not_finalized", workerId, startMonotonic);
      return;
    }

    if (sessionRow.ai_analyzed_at !== null && sessionRow.ai_analyzed_at !== undefined) {
      // Session already analyzed in a previous execution -> record skipped run
      await handleJobSkip(sessionId, projectId, "session_already_analyzed", workerId, startMonotonic);
      return;
    }

    // 2. Build Timeline (and extract fingerprints in a single pass)
    const timeline = await buildSessionTimeline(sessionId);

    // 3. Find Candidate Issue Groups using fingerprints collected during the timeline query
    const allCandidates = await findCandidateIssueGroups(projectId, timeline.rawFingerprints);
    // Cap to 10 candidates to ensure prompt context and duplicate validation boundaries match exactly
    const candidates = allCandidates.slice(0, 10);

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
    let llmResult = await provider.invoke(prompt);
    let triageData: any;
    let repairCount = 0;
    let attemptNumber = 1;

    try {
      triageData = extractAndValidateJSON(llmResult.rawContent);
    } catch (err: any) {
      if (err instanceof AIValidationError) {
        console.warn(
          JSON.stringify({
            level: "warn",
            workerId,
            sessionId,
            projectId,
            action: "triage_repair_attempt",
            message: `Initial LLM response failed validation (${err.code}). Attempting repair.`,
            error: err.message,
          })
        );

        // Record initial failure run status as 'repairing' inside database
        const repairRunId = crypto.randomUUID();
        await pool.query(
          `
          INSERT INTO ai_triage_runs (
            id, session_id, project_id, model, prompt_version, status,
            input_tokens, output_tokens, error_message, error_type,
            attempt_number, failure_stage, job_id, repair_count, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'v1', 'repairing', $5, $6, $7, $8, 1, 'validation', $10, 0, $9, $9)
          ON CONFLICT (session_id) DO UPDATE SET
            status = EXCLUDED.status,
            input_tokens = EXCLUDED.input_tokens,
            output_tokens = EXCLUDED.output_tokens,
            error_message = EXCLUDED.error_message,
            error_type = EXCLUDED.error_type,
            attempt_number = EXCLUDED.attempt_number,
            failure_stage = EXCLUDED.failure_stage,
            job_id = EXCLUDED.job_id,
            repair_count = EXCLUDED.repair_count,
            updated_at = EXCLUDED.updated_at
          `,
          [
            repairRunId,
            sessionId,
            projectId,
            llmResult.model,
            llmResult.input_tokens ?? null,
            llmResult.output_tokens ?? null,
            err.message,
            err.code,
            Date.now(),
            jobId,
          ]
        );

        // Get raw output from WeakMap
        const rawOutput = getRawOutput(err) || llmResult.rawContent;

        // Build repair prompt
        const repairPrompt = buildRepairPrompt(rawOutput, err.message);

        // Call LLM Service for repair attempt
        const repairLlmResult = await provider.invoke(repairPrompt);
        repairCount = 1;
        attemptNumber = 2;

        try {
          triageData = extractAndValidateJSON(repairLlmResult.rawContent);
          // Accumulate tokens
          llmResult = {
            ...repairLlmResult,
            input_tokens: (llmResult.input_tokens ?? 0) + (repairLlmResult.input_tokens ?? 0),
            output_tokens: (llmResult.output_tokens ?? 0) + (repairLlmResult.output_tokens ?? 0),
          };

          console.info(
            JSON.stringify({
              level: "info",
              workerId,
              sessionId,
              projectId,
              action: "triage_validation_success",
              message: "LLM output repaired successfully.",
            })
          );
        } catch (repairErr: any) {
          const actualRepairErr = repairErr instanceof AIValidationError ? repairErr : new AIValidationError(repairErr.message, "json_parse_failed", { cause: repairErr });
          
          console.error(
            JSON.stringify({
              level: "error",
              workerId,
              sessionId,
              projectId,
              action: "triage_repair_failed",
              message: `LLM repair attempt failed validation (${actualRepairErr.code}).`,
              error: actualRepairErr.message,
            })
          );

          // Update run record in DB to status = 'failed'
          await pool.query(
            `
            INSERT INTO ai_triage_runs (
              id, session_id, project_id, model, prompt_version, status,
              input_tokens, output_tokens, error_message, error_type,
              attempt_number, failure_stage, job_id, repair_count, created_at, completed_at, duration_ms, updated_at
            ) VALUES ($1, $2, $3, $4, 'v1', 'failed', $5, $6, $7, $8, 2, 'repair', $10, 1, $9, $9, $11, $9)
            ON CONFLICT (session_id) DO UPDATE SET
              status = EXCLUDED.status,
              input_tokens = EXCLUDED.input_tokens,
              output_tokens = EXCLUDED.output_tokens,
              error_message = EXCLUDED.error_message,
              error_type = EXCLUDED.error_type,
              attempt_number = EXCLUDED.attempt_number,
              failure_stage = EXCLUDED.failure_stage,
              job_id = EXCLUDED.job_id,
              repair_count = EXCLUDED.repair_count,
              completed_at = EXCLUDED.completed_at,
              duration_ms = EXCLUDED.duration_ms,
              updated_at = EXCLUDED.updated_at
            `,
            [
              repairRunId,
              sessionId,
              projectId,
              repairLlmResult.model,
              (llmResult.input_tokens ?? 0) + (repairLlmResult.input_tokens ?? 0),
              (llmResult.output_tokens ?? 0) + (repairLlmResult.output_tokens ?? 0),
              actualRepairErr.message,
              actualRepairErr.code,
              Date.now(),
              jobId,
              Math.round(performance.now() - startMonotonic),
            ]
          );

          throw actualRepairErr;
        }
      } else {
        throw err;
      }
    }

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
      if (triageData.issue_group_action === "ignore") {
        await client.query(
          `
          UPDATE sessions SET
            ai_analysis_skipped = true,
            ai_skip_reason = 'ignore',
            ai_analyzed_at = $1,
            ai_session_summary = $2,
            ai_goal_completed = $3,
            ai_friction_score = $4,
            ai_triage_confidence = $5,
            ai_summary = $2,
            goal_completed = $3,
            friction_score = $4,
            ai_confidence = $5,
            ai_reasoning = $6,
            ai_triaged_at = $1,
            updated_at = $1
          WHERE id = $7
          `,
          [
            updateTime,
            triageData.session_summary,
            triageData.goal_completed,
            triageData.friction_score,
            triageData.confidence,
            triageData.reasoning,
            sessionId,
          ]
        );
        console.info(
          JSON.stringify({
            level: "info",
            action: "issue_group_ignored",
            sessionId,
          })
        );
      } else {
        // Step B: Issue detected. Determine action: Attach or Create
        let targetGroupId: string;

        if (triageData.issue_group_action === "create") {
          const primaryFp = timeline.fingerprints[0] || null;
          targetGroupId = await createIssueGroup(client, projectId, primaryFp, triageData, updateTime, sessionId);
          console.info(
            JSON.stringify({
              level: "info",
              action: "issue_group_created",
              sessionId,
              issueGroupId: targetGroupId,
              fingerprint: primaryFp,
            })
          );
        } else if (triageData.issue_group_action === "attach") {
          targetGroupId = triageData.issue_group_id!;
          await attachIssueGroup(client, projectId, targetGroupId, updateTime, sessionId);
          console.info(
            JSON.stringify({
              level: "info",
              action: "issue_group_attached",
              sessionId,
              issueGroupId: targetGroupId,
            })
          );
        } else {
          throw new Error(`Unsupported issue group action: ${triageData.issue_group_action}`);
        }

        // Create issue instance record linked to the target group
        const instanceId = `inst_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
        const issueDetail = triageData.issues?.[0] || {
          title: triageData.session_summary || "Session Issue Instance",
          root_cause: null,
          suggested_fix: null,
          severity: "P2" as const,
          confidence: 0.5,
          evidence: [],
          reproduction_steps: [],
        };

        const primaryFp = timeline.fingerprints[0] || null;

        const insertRes = await client.query(
          `
          INSERT INTO issue_instances (
            id, issue_group_id, session_id, project_id, title, root_cause,
            suggested_fix, severity, timestamp_ms, confidence, evidence_json,
            reproduction_json, created_at, fingerprint, ai_confidence, detected_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (issue_group_id, session_id) DO NOTHING
          RETURNING 1
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
            primaryFp,
            issueDetail.confidence,
            Number(sessionRow.started_at),
            updateTime
          ]
        );

        if (insertRes.rowCount && insertRes.rowCount > 0) {
          // Increment count and update timestamp
          await client.query(
            `
            UPDATE issue_groups SET
              affected_session_count = affected_session_count + 1,
              last_seen_at = GREATEST(last_seen_at, $1),
              updated_at = $1
            WHERE id = $2
            `,
            [updateTime, targetGroupId]
          );

          console.info(
            JSON.stringify({
              level: "info",
              action: "issue_instance_created",
              sessionId,
              issueGroupId: targetGroupId,
            })
          );
        }

        // Update session's issue counts
        await client.query(
          `
          UPDATE sessions SET
            issue_instance_count = (SELECT COUNT(*)::integer FROM issue_instances WHERE session_id = $7),
            issue_group_count = (SELECT COUNT(DISTINCT issue_group_id)::integer FROM issue_instances WHERE session_id = $7),
            ai_analyzed_at = $1,
            ai_analysis_skipped = false,
            ai_skip_reason = NULL,
            ai_session_summary = $2,
            ai_goal_completed = $3,
            ai_friction_score = $4,
            ai_triage_confidence = $5,
            ai_summary = $2,
            goal_completed = $3,
            friction_score = $4,
            ai_confidence = $5,
            ai_reasoning = $6,
            ai_triaged_at = $1,
            updated_at = $1
          WHERE id = $7
          `,
          [
            updateTime,
            triageData.session_summary,
            triageData.goal_completed,
            triageData.friction_score,
            triageData.confidence,
            triageData.reasoning,
            sessionId,
          ]
        );
      }

      // Step C: Log successful AI triage run
      const runStatus = triageData.issue_group_action === "ignore" ? "ignored" : "completed";
      const triageDurationMs = Math.round(performance.now() - startMonotonic);

      await client.query(
        `
        INSERT INTO ai_triage_runs (
          id, session_id, project_id, model, prompt_version, status,
          input_tokens, output_tokens, error_message, error_type,
          attempt_number, failure_stage, job_id, repair_count, created_at, completed_at, duration_ms, updated_at
        ) VALUES ($1, $2, $3, $4, 'v1', $12, $5, $6, NULL, NULL, $9, NULL, $11, $10, $7, $8, $13, $8)
        ON CONFLICT (session_id) DO UPDATE SET
          status = EXCLUDED.status,
          input_tokens = EXCLUDED.input_tokens,
          output_tokens = EXCLUDED.output_tokens,
          error_message = EXCLUDED.error_message,
          error_type = EXCLUDED.error_type,
          attempt_number = EXCLUDED.attempt_number,
          failure_stage = EXCLUDED.failure_stage,
          job_id = EXCLUDED.job_id,
          repair_count = EXCLUDED.repair_count,
          completed_at = EXCLUDED.completed_at,
          duration_ms = EXCLUDED.duration_ms,
          updated_at = EXCLUDED.updated_at
        `,
        [
          triageRunId,
          sessionId,
          projectId,
          llmResult.model,
          llmResult.input_tokens ?? null,
          llmResult.output_tokens ?? null,
          updateTime,
          updateTime,
          attemptNumber,
          repairCount,
          jobId,
          runStatus,
          triageDurationMs,
        ]
      );

      console.info(
        JSON.stringify({
          level: "info",
          action: "triage_completed",
          sessionId,
          status: runStatus,
        })
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
    await handleJobFailure(sessionId, projectId, attempts, err, maxAttempts, workerId, undefined, startMonotonic);
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
  overrideReason?: string,
  startMonotonic?: number
): Promise<void> {
  const now = Date.now();
  const isDeadLetter = overrideReason !== undefined || attempts >= maxAttempts;
  const reason = overrideReason || (attempts >= maxAttempts ? "max_attempts_reached" : "triage_failed");
  const jobId = sessionId;
  const durationMs = startMonotonic ? Math.round(performance.now() - startMonotonic) : 0;

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
      const errType = error instanceof AIValidationError ? error.code : "job_failure";
      const failureStage = error instanceof AIValidationError ? "validation" : "execution";
      const attemptNum = error instanceof AIValidationError ? (attempts === 1 ? 1 : 2) : 1;

      await client.query(
        `
        INSERT INTO ai_triage_runs (
          id, session_id, project_id, model, prompt_version, status,
          input_tokens, output_tokens, error_message, error_type,
          attempt_number, failure_stage, job_id, repair_count, created_at, completed_at, duration_ms, updated_at
        ) VALUES ($1, $2, $3, 'unknown', 'v1', 'failed', NULL, NULL, $4, $5, $6, $7, $9, 0, $8, $8, $10, $8)
        ON CONFLICT (session_id) DO UPDATE SET
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          error_type = EXCLUDED.error_type,
          attempt_number = COALESCE(ai_triage_runs.attempt_number, EXCLUDED.attempt_number),
          failure_stage = COALESCE(ai_triage_runs.failure_stage, EXCLUDED.failure_stage),
          job_id = COALESCE(ai_triage_runs.job_id, EXCLUDED.job_id),
          repair_count = COALESCE(ai_triage_runs.repair_count, EXCLUDED.repair_count),
          completed_at = EXCLUDED.completed_at,
          duration_ms = EXCLUDED.duration_ms,
          updated_at = EXCLUDED.updated_at
        `,
        [runId, sessionId, projectId, error.message, errType, attemptNum, failureStage, now, jobId, durationMs]
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
