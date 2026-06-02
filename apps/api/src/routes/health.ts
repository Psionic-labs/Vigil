/**
 * @file health.ts
 * @description Liveness / readiness probe endpoints.
 * @how Serves a lightweight JSON payload with system timestamp.
 * @why Enables external infrastructure (Docker/Kubernetes/Railway) to verify the process is alive.
 */
import { Hono } from "hono";

export const healthRouter = new Hono();

/**
 * Basic health check endpoint.
 * Verified by internal infrastructure (e.g., Docker/K8s/Railway) to ensure
 * the Node process is actively serving traffic.
 */
healthRouter.get("/", (c) => {
  return c.json({
    status: "ok",
    version: "1.0.0", // In the future, this can be injected from package.json or CI
    timestamp: new Date().toISOString(),
  });
});
