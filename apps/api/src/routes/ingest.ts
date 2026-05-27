/**
 * @file ingest.ts
 * @description Telemetry ingestion endpoint.
 * @how Validates project credentials, enforces batch payload size limits, and performs atomic session upserts, summary logs, and background replay persistence.
 * @why Acts as the core entry gate for client-side SDK signals, ensuring fast, idempotent, and transactional recording.
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { IngestPayloadSchema } from "../validation/ingest-schema";
import { pool, withTransaction } from "../db";
import { persistReplayBlob } from "../lib/blob-storage";
import { generateFingerprint } from "../lib/fingerprint";
import crypto from "node:crypto";
import * as util from "node:util";

const ingest = new Hono<{ Variables: { requestId: string } }>();

// 2MB Body Limit for the ingestion endpoint
ingest.use(
  "/",
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => {
      return c.json({ ok: false, success: false, error: "Payload Too Large" }, 413);
    },
  })
);

ingest.post("/", zValidator("json", IngestPayloadSchema, (result, c) => {
  if (!result.success) {
    return c.json({
      ok: false,
      success: false,
      error: { message: "Validation Error", issues: result.error.issues }
    }, 400);
  }
}), async (c) => {
  const reqId = c.get("requestId") || "unknown";
  const startMs = performance.now();
  const payload = c.req.valid("json");

  // 1. Project Validation — runs BEFORE transaction to avoid wasting DB resources on invalid payloads.
  // Uses the partial index idx_projects_public_key_active for fast lookups.
  const projectResult = await pool.query(
    "SELECT id FROM projects WHERE public_key = $1 AND is_active = true",
    [payload.projectKey]
  );

  if (projectResult.rows.length === 0) {
    console.warn(`[Ingest] Rejected | ReqID: ${reqId} | Reason: invalid or inactive project key`);
    return c.json({ ok: false, success: false, error: "Unauthorized" }, 401);
  }

  const projectId = projectResult.rows[0].id as string;

  // 2. Compute Summary Flags
  let hasJsError = false;
  let hasRageClick = false;
  let hasNetworkErr = false;
  let hasDeadClick = false;

  for (const event of payload.summary) {
    if (event.type === "js_error" || event.type === "console_error") {
      hasJsError = true;
    }
    if (event.type === "rage_click") hasRageClick = true;
    if (event.type === "network_error") hasNetworkErr = true;
    if (event.type === "dead_click") hasDeadClick = true;
  }

  // 3. Finalization Logistics
  const createdAt = Date.now();
  const endedAt = payload.isFinal ? createdAt : null;
  const durationMs = payload.isFinal ? 0 : null; // ON CONFLICT will compute it from server timestamps

  // Temporary structured instrumentation for auditing finalization flow
  console.info("[Finalization]", {
    requestId: reqId,
    sessionId: payload.sessionId,
    isFinal: payload.isFinal,
    endedAt,
    durationMs,
  });

  if (payload.isFinal) {
    console.info("[Finalization] Executing final session flush", {
      requestId: reqId,
      sessionId: payload.sessionId,
    });
  }

  // Log bindings for audit
  console.info("[Finalization] Upsert parameters:", [
    payload.sessionId,
    projectId,
    payload.metadata.url,
    payload.metadata.userAgent,
    payload.metadata.screenWidth,
    payload.metadata.screenHeight,
    payload.metadata.release || null,
    payload.metadata.commitSha || null,
    payload.metadata.environment || null,
    payload.sdkVersion,
    payload.metadata.startedAt,
    createdAt,
    createdAt, // updated_at
    hasJsError,
    hasRageClick,
    hasNetworkErr,
    hasDeadClick,
    endedAt,
    durationMs,
  ]);

  // 4. Transactional Upsert
  let insertedSummaryCount = 0;
  const totalSummaryCount = payload.summary.length;
  let newErrors = 0;

  try {
    const dbTimeStart = performance.now();
    await withTransaction(async (client) => {
      // Upsert Session (Step 1: metadata and boolean flags)
      const sessionResult = await client.query(
        `
        INSERT INTO sessions (
          id, project_id, url, user_agent, screen_width, screen_height,
          release, commit_sha, environment, sdk_version, started_at, created_at, updated_at,
          has_js_error, has_rage_click, has_network_err, has_dead_click, error_count,
          ended_at, duration_ms
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, 0, -- error_count is initialized to 0 and updated in Step 3 based on actual inserts
          $18, $19
        ) ON CONFLICT (id) DO UPDATE SET
          updated_at = GREATEST(sessions.updated_at, EXCLUDED.updated_at),
          ended_at = GREATEST(sessions.ended_at, EXCLUDED.ended_at),
          duration_ms = CASE
            WHEN EXCLUDED.ended_at IS NOT NULL THEN
              GREATEST(
                COALESCE(sessions.duration_ms, 0),
                GREATEST(EXCLUDED.ended_at - sessions.created_at, 0)
              )
            ELSE sessions.duration_ms
          END,
          has_js_error = sessions.has_js_error OR EXCLUDED.has_js_error,
          has_rage_click = sessions.has_rage_click OR EXCLUDED.has_rage_click,
          has_network_err = sessions.has_network_err OR EXCLUDED.has_network_err,
          has_dead_click = sessions.has_dead_click OR EXCLUDED.has_dead_click,
          error_count = sessions.error_count -- Keep unchanged on conflict metadata updates
        RETURNING duration_ms, has_js_error, has_rage_click, has_network_err, has_dead_click
        `,
        [
          payload.sessionId,
          projectId,
          payload.metadata.url,
          payload.metadata.userAgent,
          payload.metadata.screenWidth,
          payload.metadata.screenHeight,
          payload.metadata.release || null,
          payload.metadata.commitSha || null,
          payload.metadata.environment || null,
          payload.sdkVersion,
          payload.metadata.startedAt,
          createdAt,
          createdAt, // updated_at
          hasJsError,
          hasRageClick,
          hasNetworkErr,
          hasDeadClick,
          endedAt,
          durationMs,
        ]
      );

      // Batch Insert Summary Events (Step 2)
      if (payload.summary.length > 0) {
        const params: any[] = [];
        const placeholders: string[] = [];
        let paramIndex = 1;

        for (const event of payload.summary) {
          // Normalize and stringify target safely
          let targetStr: string;
          if (typeof event.target === "object" && event.target !== null) {
            try {
              targetStr = JSON.stringify(event.target);
            } catch {
              targetStr = util.inspect(event.target, { depth: 2, maxArrayLength: 50 });
            }
          } else {
            targetStr = event.target ? String(event.target) : "";
          }
          const dbTargetStr = targetStr.length > 10000 ? targetStr.substring(0, 10000) : targetStr;
          const hashTargetStr = targetStr.substring(0, 500);

          // Construct a stable identifier string containing type-specific fields to prevent ID collisions
          let stableExtra: string;
          if (event.type === "js_error" || event.type === "console_error") {
            const errMsg = (event.errorMessage || event.message || "").substring(0, 500);
            const errStack = (event.errorStack || event.stack || "").substring(0, 500);
            stableExtra = `${errMsg}:${errStack}`;
          } else if (event.type === "network_error") {
            const netUrl = (event.networkUrl || "").substring(0, 500);
            const netMethod = (event.networkMethod || "").substring(0, 50);
            const netStatus = event.networkStatus !== undefined ? String(event.networkStatus) : "";
            stableExtra = `${netUrl}:${netMethod}:${netStatus}`;
          } else if (event.type === "navigation") {
            const navFromStr = (event.navFrom || "").substring(0, 500);
            const navToStr = (event.navTo || "").substring(0, 500);
            const navType = event.navigationType || "";
            stableExtra = `${navFromStr}:${navToStr}:${navType}`;
          } else {
            // Clicks (click, rage_click, dead_click, significant_click)
            const clickCount = event.clickCount !== undefined ? String(event.clickCount) : "";
            stableExtra = `${hashTargetStr}:${clickCount}`;
          }

          const hashInput = `${payload.sessionId}:${event.type}:${event.timestampMs}:${stableExtra}`;
          const eventId = crypto.createHash("sha256").update(hashInput).digest("hex");

          const fingerprint = generateFingerprint(event, payload.metadata.url);

          placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, $${paramIndex+12}, $${paramIndex+13}, $${paramIndex+14})`);
          
          params.push(
            eventId,
            payload.sessionId,
            projectId,
            event.type,
            event.timestampMs,
            dbTargetStr,
            event.errorMessage || event.message || null,
            event.errorStack || event.stack || null,
            event.networkUrl || null,
            event.networkStatus || null,
            event.networkMethod || null,
            event.clickCount || null,
            event.navTo || null,
            fingerprint,
            createdAt
          );
          paramIndex += 15;
        }

        const summaryResult = await client.query(
          `
          INSERT INTO events_summary (
            id, session_id, project_id, type, timestamp_ms, target,
            error_message, error_stack, network_url, network_status, network_method,
            click_count, nav_to, fingerprint, created_at
          ) VALUES ${placeholders.join(", ")}
          ON CONFLICT (id) DO NOTHING
          RETURNING type
          `,
          params
        );
        insertedSummaryCount = summaryResult?.rowCount || 0;

        if (summaryResult && summaryResult.rows) {
          for (const row of summaryResult.rows) {
            const type = row.type;
            if (type === "js_error" || type === "console_error") {
              newErrors++;
            }
          }
        }
      }

      // Step 3: Monotonically apply cumulative updates to error_count based on actual inserted summary rows
      if (newErrors > 0) {
        await client.query(
          `
          UPDATE sessions SET
            error_count = error_count + $1,
            updated_at = GREATEST(updated_at, $2)
          WHERE id = $3
          `,
          [newErrors, createdAt, payload.sessionId]
        );
      }

      // Step 4: Finalization & AI Triage Queueing
      if (payload.isFinal) {
        // Apply skip heuristics based on the finalized session state returned from Step 1
        const sessionState = sessionResult.rows[0];
        if (sessionState) {
          const finalDurationMs = sessionState.duration_ms !== null ? Number(sessionState.duration_ms) : 0;
          const finalHasJsError = Boolean(sessionState.has_js_error);
          const finalHasRageClick = Boolean(sessionState.has_rage_click);
          const finalHasNetworkErr = Boolean(sessionState.has_network_err);
          const finalHasDeadClick = Boolean(sessionState.has_dead_click);

          let skip = false;
          let skipReason: string | null = null;

          // Simple deterministic cheap noise skip heuristics
          if (finalDurationMs < 5000) {
            skip = true;
            skipReason = "duration_under_5s";
          } else if (!finalHasJsError && !finalHasRageClick && !finalHasNetworkErr && !finalHasDeadClick) {
            skip = true;
            skipReason = "no_friction_signals";
          }

          if (skip) {
            await client.query(
              `
              UPDATE sessions SET
                ai_analysis_skipped = true,
                ai_skip_reason = $1
              WHERE id = $2
              `,
              [skipReason, payload.sessionId]
            );
            console.log(`[Ingest] Session finalized & skipped | ReqID: ${reqId} | SessionID: ${payload.sessionId} | Duration: ${finalDurationMs}ms | Reason: ${skipReason}`);
          } else {
            // Not skipped: update skip flags in case it was previously marked skipped, then enqueue job
            await client.query(
              `
              UPDATE sessions SET
                ai_analysis_skipped = false,
                ai_skip_reason = NULL
              WHERE id = $1
              `,
              [payload.sessionId]
            );

            const jobResult = await client.query(
              `
              INSERT INTO triage_jobs (session_id, project_id, status, created_at, updated_at)
              VALUES ($1, $2, 'pending', $3, $3)
              ON CONFLICT (session_id) DO NOTHING
              `,
              [payload.sessionId, projectId, createdAt]
            );

            const enqueued = (jobResult.rowCount ?? 0) > 0;
            if (enqueued) {
              console.log(`[Ingest] Session finalized & triage job enqueued | ReqID: ${reqId} | SessionID: ${payload.sessionId} | Duration: ${finalDurationMs}ms | Enqueue: success`);
            } else {
              console.log(`[Ingest] Session finalized & triage job duplicate suppressed | ReqID: ${reqId} | SessionID: ${payload.sessionId} | Duration: ${finalDurationMs}ms | Enqueue: skipped_duplicate`);
            }
          }
        }
      }
    });
    const dbTimeEnd = performance.now();

    // 5. Replay Persistence (Async background persistence after DB commit)
    // Wrap in setImmediate to schedule the serialization (JSON.stringify) off the request's critical path.
    if (payload.events && payload.events.length > 0) {
      console.log(`[Ingest] Scheduling async replay persistence | ReqID: ${reqId} | Events: ${payload.events.length}`);
      setImmediate(() => {
        persistReplayBlob(projectId, payload.sessionId, payload.events)
          .then((result) => {
            if (!result) return;
            console.log(
              `[Ingest] Blob saved | ReqID: ${reqId} | Path: ${result.path} | Size: ${result.compressedBytes} B | Serialization: ${result.serializationMs.toFixed(2)}ms | Compression: ${result.compressionMs.toFixed(2)}ms | Write: ${result.writeMs.toFixed(2)}ms`
            );

            // Lightweight async metadata update of the session row post-response
            const updateTime = Date.now();
            const normalizedPath = result.path.replace(/\\/g, "/");
            const pathParts = normalizedPath.split("/blobs/v1/");
            const relativeBlobPath = pathParts[1] ? `blobs/v1/${pathParts[1]}` : result.path;

            pool.query(
              `
              UPDATE sessions
              SET
                blob_path = $1,
                updated_at = $2
              WHERE id = $3
              `,
              [relativeBlobPath, updateTime, payload.sessionId]
            )
              .then(() => {
                console.log(`[Ingest] Session blob_path metadata updated | ReqID: ${reqId} | SessionID: ${payload.sessionId} | Path: ${relativeBlobPath}`);
              })
              .catch((dbErr) => {
                console.error(`[Ingest] Failed to update session blob_path metadata | ReqID: ${reqId} | SessionID: ${payload.sessionId}`, dbErr);
              });
          })
          .catch((err) => {
            console.error(`[Ingest] Background blob persistence failed | ReqID: ${reqId}`, err);
          });
      });
    }

    const totalMs = performance.now() - startMs;
    console.log(
      `[Ingest] Success | ReqID: ${reqId} | Project: ${projectId} | DB: ${(dbTimeEnd - dbTimeStart).toFixed(2)}ms | Total: ${totalMs.toFixed(2)}ms | Events: ${payload.events.length} | Summaries: ${totalSummaryCount} (Inserted: ${insertedSummaryCount}, Skipped: ${totalSummaryCount - insertedSummaryCount}) | Aggregates: error_count=+${newErrors}`
    );

    return c.json({ ok: true, success: true });
  } catch (err: any) {
    console.error(`[Ingest] Transaction failed | ReqID: ${reqId}`, err);
    return c.json({ ok: false, success: false, error: "Ingestion failed" }, 500);
  }
});

export default ingest;
