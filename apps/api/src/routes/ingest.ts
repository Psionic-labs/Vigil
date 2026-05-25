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
import crypto from "node:crypto";
import * as util from "node:util";

const ingest = new Hono<{ Variables: { requestId: string } }>();

// 2MB Body Limit for the ingestion endpoint
ingest.use(
  "/",
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => {
      return c.json({ success: false, error: "Payload Too Large" }, 413);
    },
  })
);

ingest.post("/", zValidator("json", IngestPayloadSchema, (result, c) => {
  if (!result.success) {
    return c.json({
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
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const projectId = projectResult.rows[0].id as string;

  // 2. Compute Summary Flags
  let hasJsError = false;
  let hasRageClick = false;
  let hasNetworkErr = false;
  let hasDeadClick = false;
  let errorCount = 0;

  for (const event of payload.summary) {
    if (event.type === "js_error" || event.type === "console_error") {
      hasJsError = true;
      errorCount++;
    }
    if (event.type === "rage_click") hasRageClick = true;
    if (event.type === "network_error") hasNetworkErr = true;
    if (event.type === "dead_click") hasDeadClick = true;
  }

  // 3. Finalization Logistics
  const createdAt = Date.now();
  const endedAt = payload.isFinal ? createdAt : null;
  const durationMs = payload.isFinal
    ? Math.max(0, Math.min(2147483647, createdAt - payload.metadata.startedAt))
    : null;

  // 4. Transactional Upsert
  try {
    const dbTimeStart = performance.now();
    await withTransaction(async (client) => {
      // Upsert Session
      await client.query(
        `
        INSERT INTO sessions (
          id, project_id, url, user_agent, screen_width, screen_height,
          release, commit_sha, environment, sdk_version, started_at, created_at, updated_at,
          has_js_error, has_rage_click, has_network_err, has_dead_click, error_count,
          ended_at, duration_ms
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) ON CONFLICT (id) DO UPDATE SET
          updated_at = GREATEST(sessions.updated_at, EXCLUDED.updated_at),
          -- ended_at and duration_ms use GREATEST for monotonic safety:
          -- a retried final flush with a slightly different server timestamp cannot regress these values.
          -- A non-final batch (NULL) cannot clear a previously finalized session (GREATEST ignores NULLs).
          ended_at = GREATEST(sessions.ended_at, EXCLUDED.ended_at),
          duration_ms = GREATEST(sessions.duration_ms, EXCLUDED.duration_ms),
          -- has_* flags use OR-accumulation: once true, stays true across all future upserts.
          has_js_error = sessions.has_js_error OR EXCLUDED.has_js_error,
          has_rage_click = sessions.has_rage_click OR EXCLUDED.has_rage_click,
          has_network_err = sessions.has_network_err OR EXCLUDED.has_network_err,
          has_dead_click = sessions.has_dead_click OR EXCLUDED.has_dead_click,
          -- error_count uses GREATEST to avoid double counting retried payloads.
          error_count = GREATEST(sessions.error_count, EXCLUDED.error_count)
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
          createdAt, // updated_at = server timestamp of this batch
          hasJsError,
          hasRageClick,
          hasNetworkErr,
          hasDeadClick,
          errorCount,
          endedAt,
          durationMs,
        ]
      );

      // Batch Insert Summary Events
      if (payload.summary.length > 0) {
        const params: any[] = [];
        const placeholders: string[] = [];
        let paramIndex = 1;

        for (const event of payload.summary) {
          // Deterministic ID for idempotency (session + type + timestamp + target stringified)
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
          if (targetStr.length > 10000) targetStr = targetStr.substring(0, 10000);

          const hashInput = `${payload.sessionId}:${event.type}:${event.timestampMs}:${targetStr}`;
          const eventId = crypto.createHash("sha256").update(hashInput).digest("hex");

          placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, $${paramIndex+12}, $${paramIndex+13})`);
          
          params.push(
            eventId,
            payload.sessionId,
            projectId,
            event.type,
            event.timestampMs,
            targetStr,
            event.errorMessage || event.message || null,
            event.errorStack || event.stack || null,
            event.networkUrl || null,
            event.networkStatus || null,
            event.networkMethod || null,
            event.clickCount || null,
            event.navTo || null,
            createdAt
          );
          paramIndex += 14;
        }

        await client.query(
          `
          INSERT INTO events_summary (
            id, session_id, project_id, type, timestamp_ms, target,
            error_message, error_stack, network_url, network_status, network_method,
            click_count, nav_to, created_at
          ) VALUES ${placeholders.join(", ")}
          ON CONFLICT (id) DO NOTHING
          `,
          params
        );
      }
    });
    const dbTimeEnd = performance.now();

    // 5. Replay Persistence (Async background persistence after DB commit)
    // Wrap in setImmediate to schedule the serialization (JSON.stringify) off the request's critical path.
    setImmediate(() => {
      persistReplayBlob(projectId, payload.sessionId, payload.events)
        .then((result) => {
          if (!result) return;
          console.log(
            `[Ingest] Blob saved | ReqID: ${reqId} | Path: ${result.filePath} | Size: ${result.compressedSize} B | Serialization: ${result.serializationDurationMs.toFixed(2)}ms | Compression: ${result.compressionDurationMs.toFixed(2)}ms | Write: ${result.writeDurationMs.toFixed(2)}ms`
          );
        })
        .catch((err) => {
          console.error(`[Ingest] Background blob persistence failed | ReqID: ${reqId}`, err);
        });
    });

    const totalMs = performance.now() - startMs;
    console.log(
      `[Ingest] Success | ReqID: ${reqId} | Project: ${projectId} | DB: ${(dbTimeEnd - dbTimeStart).toFixed(2)}ms | Total: ${totalMs.toFixed(2)}ms | Events: ${payload.events.length}`
    );

    return c.json({ success: true });
  } catch (err: any) {
    console.error(`[Ingest] Transaction failed | ReqID: ${reqId}`, err);
    return c.json({ success: false, error: "Ingestion failed" }, 500);
  }
});

export default ingest;
