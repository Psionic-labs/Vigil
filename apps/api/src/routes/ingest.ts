import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { IngestPayloadSchema } from "../validation/ingest-schema";
import { pool, withTransaction } from "../db";
import { persistReplayBlob } from "../lib/blob-storage";
import crypto from "node:crypto";

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

  // 1. Project Validation
  const projectResult = await pool.query(
    "SELECT id FROM projects WHERE public_key = $1",
    [payload.projectKey]
  );

  if (projectResult.rows.length === 0) {
    console.warn(`[Ingest] Unauthorized project key: ${payload.projectKey}`);
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
  const durationMs = payload.isFinal ? createdAt - payload.metadata.startedAt : null;

  // 4. Transactional Upsert
  try {
    const dbTimeStart = performance.now();
    await withTransaction(async (client) => {
      // Upsert Session
      await client.query(
        `
        INSERT INTO sessions (
          id, project_id, url, user_agent, screen_width, screen_height,
          release, commit_sha, environment, sdk_version, started_at, created_at,
          has_js_error, has_rage_click, has_network_err, has_dead_click, error_count,
          ended_at, duration_ms
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) ON CONFLICT (id) DO UPDATE SET
          ended_at = COALESCE(EXCLUDED.ended_at, sessions.ended_at),
          duration_ms = COALESCE(EXCLUDED.duration_ms, sessions.duration_ms),
          has_js_error = sessions.has_js_error OR EXCLUDED.has_js_error,
          has_rage_click = sessions.has_rage_click OR EXCLUDED.has_rage_click,
          has_network_err = sessions.has_network_err OR EXCLUDED.has_network_err,
          has_dead_click = sessions.has_dead_click OR EXCLUDED.has_dead_click,
          error_count = sessions.error_count + EXCLUDED.error_count
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
        for (const event of payload.summary) {
          // Deterministic ID for idempotency (session + type + timestamp + target stringified)
          const targetStr = typeof event.target === "object" ? JSON.stringify(event.target) : event.target || "";
          const hashInput = `${payload.sessionId}:${event.type}:${event.timestampMs}:${targetStr}`;
          const eventId = crypto.createHash("sha256").update(hashInput).digest("hex");

          await client.query(
            `
            INSERT INTO events_summary (
              id, session_id, project_id, type, timestamp_ms, target,
              error_message, error_stack, network_url, network_status, network_method,
              click_count, nav_to, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            ) ON CONFLICT (id) DO NOTHING
            `,
            [
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
              createdAt,
            ]
          );
        }
      }
    });
    const dbTimeEnd = performance.now();

    // 5. Replay Persistence (Await to ensure it completes before returning 200, though could be deferred)
    const blobTimeStart = performance.now();
    await persistReplayBlob(projectId, payload.sessionId, payload.events);
    const blobTimeEnd = performance.now();

    const totalMs = performance.now() - startMs;
    console.log(
      `[Ingest] Success | ReqID: ${reqId} | Project: ${projectId} | DB: ${(dbTimeEnd - dbTimeStart).toFixed(2)}ms | Blob: ${(blobTimeEnd - blobTimeStart).toFixed(2)}ms | Total: ${totalMs.toFixed(2)}ms | Events: ${payload.events.length}`
    );

    return c.json({ success: true });
  } catch (err: any) {
    console.error(`[Ingest] Transaction failed | ReqID: ${reqId}`, err);
    return c.json({ success: false, error: "Ingestion failed" }, 500);
  }
});

export default ingest;
