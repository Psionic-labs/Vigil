/**
 * @file metrics.ts
 * @description Operational metrics endpoint.
 * @how Exposes hit counters, bucket sizes, and memory usage estimates from the rate limiting stores.
 * @why Enables external telemetry/observability systems (e.g. Prometheus/Grafana) to monitor limiter health.
 */

import { Hono } from "hono";
import { globalLimiterStore, globalProjectCache } from "../lib/rate-limit-store";
import type { AppEnv } from "../lib/types";

export const metricsRouter = new Hono<AppEnv>();

metricsRouter.get("/", (c) => {
  if (c.env && (c.env as any).incoming) {
    // If running in test environment or custom container setup, we can access Hono bindings
  }

  if (process.env.ENABLE_INTERNAL_METRICS !== "true") {
    return c.json(
      {
        ok: false,
        success: false,
        error: {
          message: "Metrics endpoint disabled",
          code: 403,
        },
      },
      403
    );
  }

  const expectedToken = process.env.INTERNAL_METRICS_TOKEN;
  if (expectedToken) {
    const authHeader = c.req.header("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token !== expectedToken) {
      return c.json(
        {
          ok: false,
          success: false,
          error: {
            message: "Unauthorized",
            code: 401,
          },
        },
        401
      );
    }
  }


  const sizes = globalLimiterStore.getSizes();
  const memoryBytes = globalLimiterStore.getEstimatedMemoryUsageBytes();

  return c.json({
    ok: true,
    success: true,
    metrics: {
      ipLimitedCount: globalLimiterStore.ipLimitedHits,
      projectLimitedCount: globalLimiterStore.projectLimitedHits,
      sessionLimitedCount: globalLimiterStore.sessionLimitedHits,
      activeBuckets: {
        ip: sizes.ip,
        project: sizes.project,
        session: sizes.session,
        total: sizes.ip + sizes.project + sizes.session,
      },
      memoryUsageEstimateBytes: memoryBytes,
      cache: {
        hits: globalProjectCache.hits,
        misses: globalProjectCache.misses,
        size: globalProjectCache.getCacheSize(),
      },
      cardinalityEvictions: globalLimiterStore.cardinalityEvictions,
    },
  });
});
