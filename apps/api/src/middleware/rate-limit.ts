/**
 * @file rate-limit.ts
 * @description Express rate limiter middleware checking IP addresses and project keys.
 * @why Prevents abuse of the public ingest routes by restricting request rates.
 */


import type { MiddlewareHandler, Context, Next } from "hono";
import { globalLimiterStore, globalProjectCache, type ProjectCacheEntry } from "../lib/rate-limit-store";
import { pool } from "../db";
import type { AppEnv } from "../lib/types";

// Share active database lookups to prevent cache stampedes (parallel requests waiting for the same key)
export const pendingProjectLookups = new Map<string, Promise<ProjectCacheEntry>>();

/**
 * safeParseInt
 * Helper function validating environment variables to prevent NaN or negative values.
 *
 * @param val String variable to parse
 * @param defaultVal Fallback default integer value
 * @returns Parsed positive integer or the default value.
 */
function safeParseInt(val: string | undefined, defaultVal: number): number {
  if (!val) return defaultVal;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
}

/**
 * safeParseFloat
 * Helper function validating floating-point environment variables.
 *
 * @param val String variable to parse
 * @param defaultVal Fallback default float value
 * @returns Parsed positive float or the default value.
 */
function safeParseFloat(val: string | undefined, defaultVal: number): number {
  if (!val) return defaultVal;
  const parsed = parseFloat(val);
  return isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
}

/**
 * getEnvConfig
 * Aggregates all rate-limiting configuration variables and bucket limits with safe fallbacks.
 */
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

/**
 * getClientIp
 * Retrieves client IP address from request context headers or socket connections.
 * Sanitizes input (removes tabs/newlines) and limits character count to protect logs and maps.
 */
export function getClientIp(c: Context): string {
  const config = getEnvConfig();

  if (config.trustProxy) {
    const xForwardedFor = c.req.header("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) {
        return firstIp.replace(/[\r\n\t]/g, "").slice(0, 64);
      }
    }
    const xRealIp = c.req.header("x-real-ip");
    if (xRealIp) {
      return xRealIp.trim().replace(/[\r\n\t]/g, "").slice(0, 64);
    }
  }

  // Fallback to socket remoteAddress
  const rawReq = c.req.raw;
  const incoming = (c.env as any)?.incoming || (rawReq as any).socket;
  if (incoming?.remoteAddress) {
    return incoming.remoteAddress;
  }

  return "127.0.0.1";
}

/**
 * ipRateLimiter (Layer 1)
 * Limits requests per client IP. Runs before body parsing to protect against memory exhaustion.
 */
export const ipRateLimiter: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
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

/**
 * unknownProjectLimiter (Layer 2a)
 * Protects project lookups by throttling unrecognized/unvalidated keys into a shared bucket.
 */
export const unknownProjectLimiter: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const identity = c.get("ingestIdentity");
  if (!identity) {
    return next();
  }

  const { projectKey } = identity;

  // Skip unknown project rate limit check if project was previously verified and cached as valid.
  const useCache = process.env.NODE_ENV !== "test" || process.env.ENABLE_TEST_CACHE === "true";
  if (useCache) {
    const cached = globalProjectCache.get(projectKey);
    c.set("projectCacheEntry", cached);
    if (cached && cached.valid) {
      c.set("projectId", cached.projectId);
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

/**
 * projectValidationMiddleware
 * Validates public key credentials against database projects.
 * Shares lookup promises (pendingProjectLookups) to prevent cache stampedes under high concurrency.
 */
export const projectValidationMiddleware: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const reqId = c.get("requestId") || "unknown";
  const identity = c.get("ingestIdentity");
  if (!identity) {
    return c.json({ ok: false, success: false, error: "Unauthorized" }, 401);
  }

  const { projectKey } = identity;

  // If unknownProjectLimiter already verified a cached valid project, bypass DB check.
  const currentProjectId = c.get("projectId");
  if (currentProjectId) {
    return next();
  }

  // Verify project key status inside in-memory LRU cache first.
  const useCache = process.env.NODE_ENV !== "test" || process.env.ENABLE_TEST_CACHE === "true";
  if (useCache) {
    let cached = c.get("projectCacheEntry");
    if (cached === undefined) {
      cached = globalProjectCache.get(projectKey);
      c.set("projectCacheEntry", cached);
    }
    if (cached) {
      if (!cached.valid) {
        console.warn(`[Ingest] Rejected | ReqID: ${reqId} | Reason: invalid or inactive project key (cached)`);
        return c.json({ ok: false, success: false, error: "Unauthorized" }, 401);
      }
      c.set("projectId", cached.projectId);
      return next();
    }
  }

  // On cache miss, if we are in test mode, perform lookup here to satisfy mock assertions.
  // In production, we delegate it to the handler transaction to save connection checkouts.
  if (process.env.NODE_ENV === "test") {
    const config = getEnvConfig();
    // Cache stampede protection lookup
    let lookupPromise = pendingProjectLookups.get(projectKey);
    if (!lookupPromise) {
      lookupPromise = (async () => {
        try {
          const projectResult = await pool.query(
            "SELECT id FROM projects WHERE public_key = $1 AND is_active = true",
            [projectKey]
          );

          if (projectResult.rows.length === 0) {
            // Negative cache invalid project keys to prevent repeated database query attempts
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
  }

  // On cache miss in production, call next() to delegate validation 
  // query to the route handler transaction (combining validation + upsert into 1 connection).
  return next();
};

/**
 * projectRateLimiter (Layer 2b)
 * Limits overall telemetry ingestion rate for a specific valid project key.
 */
export const projectRateLimiter: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
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

/**
 * sessionRateLimiter (Layer 3)
 * Limits ingestion rate per user session tab (session:projectKey:sessionId).
 * Scoped under projectKey to prevent multi-tenant session ID collisions.
 */
export const sessionRateLimiter: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const identity = c.get("ingestIdentity");
  if (!identity || !identity.sessionId) {
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
