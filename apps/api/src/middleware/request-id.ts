/**
 * @file request-id.ts
 * @description Generates and attaches a unique request identifier UUID to headers.
 * @why Simplifies log tracing and request correlation across microservices.
 */

import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";

/**
 * Assigns a unique ID to each incoming request if one is not provided.
 * Critical for correlating logs and tracing ingestion payloads through the system.
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  const reqId = c.req.header("X-Request-Id") || randomUUID();
  c.set("requestId", reqId);
  await next();
  c.res.headers.set("X-Request-Id", reqId);
}
