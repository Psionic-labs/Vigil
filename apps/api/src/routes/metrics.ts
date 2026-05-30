/**
 * @file metrics.ts
 * @description Operational metrics endpoint.
 * @how Exposes hit counters, bucket sizes, and memory usage estimates from the rate limiting stores.
 * @why Enables external telemetry/observability systems (e.g. Prometheus/Grafana) to monitor limiter health.
 */

import { Hono } from "hono";
import { globalLimiterStore, globalProjectCache } from "../lib/rate-limit-store";

export const metricsRouter = new Hono();

metricsRouter.get("/", (c) => {
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
