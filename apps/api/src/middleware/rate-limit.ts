/**
 * @file rate-limit.ts
 * @description Ingestion rate limiting middlewares.
 * @how Implements IP, unknown project, database lookup, project, and session limit checks.
 * @why Secures the ingest route from abuse and DB connection pools from exhaustion.
 */

import type { MiddlewareHandler, Context } from "hono";
import { globalLimiterStore, globalProjectCache, type ProjectCacheEntry } from "../lib/rate-limit-store";
import { pool } from "../db";
import type { AppEnv } from "../lib/types";

// Share active lookups to prevent cache stampedes
export const pendingProjectLookups = new Map<string, Promise<ProjectCacheEntry>>();

function safeParseInt(val: string | undefined, defaultVal: number): number {
  if (!val) return defaultVal;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
}

function safeParseFloat(val: string | undefined, defaultVal: number): number {
  if (!val) return defaultVal;
  const parsed = parseFloat(val);
  return isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
}

export function getEnvConfig() {
  return {
    ipRpm: safeParseInt(process.env.INGEST_IP_RPM, 120),
    projectRpm: safeParseInt(process.env.INGEST_PROJECT_RPM, 500),
    sessionRpm: safeParseInt(process.env.INGEST_SESSION_RPM, 30),
    unknownProjectRpm: safeParseInt(process.env.INGEST_UNKNOWN_PROJECT_RPM, 1000),
    burstMultiplier: safeParseFloat(process.env.INGEST_BURST_MULTIPLIER, 1.5),
    unknownProjectBurstMultiplier: safeParseFloat(process.env.INGEST_UNKNOWN_PROJECT_BURST_MULTIPLIER, 3),
    knownProjectCacheTtlMs: safeParseInt(process.env.KNOWN_PROJECT_CACHE_TTL_MS, 60000),
    maxIpBuckets: safeParseInt(process.env.RATE_LIMIT_MAX_IP_BUCKETS, 50000),
    maxProjectBuckets: safeParseInt(process.env.RATE_LIMIT_MAX_PROJECT_BUCKETS, 10000),
    maxSessionBuckets: safeParseInt(process.env.RATE_LIMIT_MAX_SESSION_BUCKETS, 100000),
    trustProxy: process.env.TRUST_PROXY === "true",
  };
}

export function getClientIp(c: Context): string {
  const config = getEnvConfig();

  if (config.trustProxy) {
    const xForwardedFor = c.req.header("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }
    const xRealIp = c.req.header("x-real-ip");
    if (xRealIp) return xRealIp;
  }

  // Fallback to socket remoteAddress
  const rawReq = c.req.raw;
  const incoming = (c.env as any)?.incoming || (rawReq as any).socket;
  if (incoming?.remoteAddress) {
    return incoming.remoteAddress;
  }

  return "127.0.0.1";
}

// 1. IP Rate Limiter (Layer 1)
export const ipRateLimiter: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ip = getClientIp(c);
  const config = getEnvConfig();

  const decision = await globalLimiterStore.consume(
    "ip",
    ip,
    config.ipRpm,
    60000, // 1 minute window
    1, // cost
    config.burstMultiplier,
    config.maxIpBuckets
  );

  if (!decision.allowed) {
    const now = Date.now();
    const retryAfterSec = Math.max(1, Math.ceil((decision.resetTimeMs - now) / 1000));
    const reqId = c.get("requestId") || "unknown";
    console.warn(`[RateLimit] IP limit exceeded | IP: ${ip} | ReqID: ${reqId} | Retry-After: ${retryAfterSec}s`);

    c.header("Retry-After", String(retryAfterSec));
    c.header("X-RateLimit-Limit", String(config.ipRpm));
    c.header("X-RateLimit-Remaining", String(decision.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(decision.resetTimeMs / 1000)));

    return c.json(
      {
        ok: false,
        success: false,
        error: "Too Many Requests",
        reason: "ip",
      },
      429
    );
  }

  await next();
};

// 2. Unknown Project Limiter (Layer 2a)
export const unknownProjectLimiter: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = c.get("ingestIdentity");
  if (!identity) {
    return next();
  }

  const { projectKey } = identity;

  // Skip unknown rate limiter if we already cached it as valid
  const useCache = process.env.NODE_ENV !== "test" || process.env.ENABLE_TEST_CACHE === "true";
  if (useCache) {
    const cached = globalProjectCache.get(projectKey);
    if (cached && cached.valid) {
      return next();
    }
  }

  const config = getEnvConfig();
  const decision = await globalLimiterStore.consume(
    "project",
    "__unknown_project__",
    config.unknownProjectRpm,
    60000,
    1,
    config.unknownProjectBurstMultiplier,
    config.maxProjectBuckets
  );

  if (!decision.allowed) {
    const now = Date.now();
    const retryAfterSec = Math.max(1, Math.ceil((decision.resetTimeMs - now) / 1000));
    const reqId = c.get("requestId") || "unknown";
    console.warn(
      `[RateLimit] Unknown project limit exceeded | Key: ${projectKey} | ReqID: ${reqId} | Retry-After: ${retryAfterSec}s`
    );

    c.header("Retry-After", String(retryAfterSec));
    c.header("X-RateLimit-Limit", String(config.unknownProjectRpm));
    c.header("X-RateLimit-Remaining", String(decision.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(decision.resetTimeMs / 1000)));

    return c.json(
      {
        ok: false,
        success: false,
        error: "Too Many Requests",
        reason: "project",
      },
      429
    );
  }

  await next();
};

// 3. Project Validation Middleware
export const projectValidationMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const reqId = c.get("requestId") || "unknown";
  const identity = c.get("ingestIdentity");
  if (!identity) {
    return c.json({ ok: false, success: false, error: "Unauthorized" }, 401);
  }

  const { projectKey } = identity;
  const config = getEnvConfig();

  // Check cache first
  const useCache = process.env.NODE_ENV !== "test" || process.env.ENABLE_TEST_CACHE === "true";
  if (useCache) {
    const cached = globalProjectCache.get(projectKey);
    if (cached) {
      if (!cached.valid) {
        console.warn(`[Ingest] Rejected | ReqID: ${reqId} | Reason: invalid or inactive project key (cached)`);
        return c.json({ ok: false, success: false, error: "Unauthorized" }, 401);
      }
      c.set("projectId", cached.projectId);
      return next();
    }
  }

  // Cache stampede protection
  let lookupPromise = pendingProjectLookups.get(projectKey);
  if (!lookupPromise) {
    lookupPromise = (async () => {
      try {
        const projectResult = await pool.query(
          "SELECT id FROM projects WHERE public_key = $1 AND is_active = true",
          [projectKey]
        );

        if (projectResult.rows.length === 0) {
          globalProjectCache.set(projectKey, false, undefined, config.knownProjectCacheTtlMs);
          return { valid: false, expiresAt: Date.now() + config.knownProjectCacheTtlMs };
        } else {
          const projectId = projectResult.rows[0].id as string;
          globalProjectCache.set(projectKey, true, projectId, config.knownProjectCacheTtlMs);
          return { valid: true, projectId, expiresAt: Date.now() + config.knownProjectCacheTtlMs };
        }
      } catch (err) {
        console.error(`[RateLimit] DB error during project lookup for key ${projectKey}:`, err);
        throw err;
      } finally {
        pendingProjectLookups.delete(projectKey);
      }
    })();
    pendingProjectLookups.set(projectKey, lookupPromise);
  }

  try {
    const entry = await lookupPromise;
    if (!entry.valid) {
      console.warn(`[Ingest] Rejected | ReqID: ${reqId} | Reason: invalid or inactive project key`);
      return c.json({ ok: false, success: false, error: "Unauthorized" }, 401);
    }
    c.set("projectId", entry.projectId);
    return next();
  } catch {
    return c.json({ ok: false, success: false, error: "Ingestion failed" }, 500);
  }
};

// 4. Known Project Rate Limiter (Layer 2b)
export const projectRateLimiter: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = c.get("ingestIdentity");
  if (!identity) {
    return next();
  }

  const { projectKey } = identity;
  const config = getEnvConfig();

  const decision = await globalLimiterStore.consume(
    "project",
    `project:${projectKey}`,
    config.projectRpm,
    60000,
    1,
    config.burstMultiplier,
    config.maxProjectBuckets
  );

  if (!decision.allowed) {
    const now = Date.now();
    const retryAfterSec = Math.max(1, Math.ceil((decision.resetTimeMs - now) / 1000));
    const reqId = c.get("requestId") || "unknown";
    console.warn(
      `[RateLimit] Project limit exceeded | ProjectKey: ${projectKey} | ReqID: ${reqId} | Retry-After: ${retryAfterSec}s`
    );

    c.header("Retry-After", String(retryAfterSec));
    c.header("X-RateLimit-Limit", String(config.projectRpm));
    c.header("X-RateLimit-Remaining", String(decision.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(decision.resetTimeMs / 1000)));

    return c.json(
      {
        ok: false,
        success: false,
        error: "Too Many Requests",
        reason: "project",
      },
      429
    );
  }

  await next();
};

// 5. Session Rate Limiter (Layer 3)
export const sessionRateLimiter: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = c.get("ingestIdentity");
  if (!identity) {
    return next();
  }

  const { sessionId, projectKey } = identity;
  const config = getEnvConfig();

  const decision = await globalLimiterStore.consume(
    "session",
    `session:${projectKey}:${sessionId}`,
    config.sessionRpm,
    60000,
    1,
    config.burstMultiplier,
    config.maxSessionBuckets
  );

  if (!decision.allowed) {
    const now = Date.now();
    const retryAfterSec = Math.max(1, Math.ceil((decision.resetTimeMs - now) / 1000));
    const reqId = c.get("requestId") || "unknown";
    console.warn(
      `[RateLimit] Session limit exceeded | SessionID: ${sessionId} | ReqID: ${reqId} | Retry-After: ${retryAfterSec}s`
    );

    c.header("Retry-After", String(retryAfterSec));
    c.header("X-RateLimit-Limit", String(config.sessionRpm));
    c.header("X-RateLimit-Remaining", String(decision.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(decision.resetTimeMs / 1000)));

    return c.json(
      {
        ok: false,
        success: false,
        error: "Too Many Requests",
        reason: "session",
      },
      429
    );
  }

  await next();
};
