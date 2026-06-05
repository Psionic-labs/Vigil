/**
 * @file health.ts
 * @description Liveness / readiness probe endpoints.
 * @how Serves a lightweight JSON payload for liveness, and queries the database for readiness with pool metrics.
 * @why Enables external infrastructure (Docker/Kubernetes/Railway/load balancers) to verify the process is alive and database is reachable.
 */
import { Hono } from "hono";
import { checkDatabaseConnection, pool } from "../db";

export const healthRouter = new Hono();

/**
 * Basic health check endpoint (backwards compatible with `/health`).
 */
healthRouter.get("/", (c) => {
  return c.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Liveness check endpoint explicitly under `/health/live`.
 * Returns a simple process liveness status.
 */
healthRouter.get("/live", (c) => {
  return c.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness check endpoint under `/health/ready`.
 * Verifies database connectivity and returns connection pool metrics.
 */
healthRouter.get("/ready", async (c) => {
  try {
    const dbTime = await checkDatabaseConnection();
    return c.json({
      status: "ready",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      database: {
        status: "connected",
        time: dbTime,
      },
      pool: {
        totalConnections: pool.totalCount ?? 0,
        idleConnections: pool.idleCount ?? 0,
        waitingRequests: pool.waitingCount ?? 0,
      },
    });
  } catch (err: any) {
    console.error("[Health] Database readiness check failed:", err);
    return c.json(
      {
        status: "unhealthy",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        database: {
          status: "disconnected",
          error: err.message || String(err),
        },
        pool: {
          totalConnections: pool.totalCount ?? 0,
          idleConnections: pool.idleCount ?? 0,
          waitingRequests: pool.waitingCount ?? 0,
        },
      },
      503,
    );
  }
});

