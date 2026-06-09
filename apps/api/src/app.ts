/**
 * @file app.ts
 * @description Sets up Express application middleware, routes, and error handling.
 * @why Serves as the central API routing and middleware configuration wrapper.
 */

import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { requestIdMiddleware } from "./middleware/request-id";
import { globalErrorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health";
import { metricsRouter } from "./routes/metrics";
import ingestRouter from "./routes/ingest";
import { projectsRouter } from "./routes/projects";

import type { AppEnv } from "./lib/types";

const app = new Hono<AppEnv>();

// 1. Foundational Middleware
// Log all requests (can be swapped for Pino/custom logger in production later)
app.use("*", logger());

// Assign a Request ID to trace ingestion payloads
app.use("*", requestIdMiddleware);

const ENABLE_CORS_DEBUG = process.env.DEBUG_CORS === "true";

app.use("/api/*", async (c, next) => {
  if (!ENABLE_CORS_DEBUG) {
    return next();
  }

  const origin = c.req.header("Origin");

  // Ignore non-browser/same-origin requests
  if (!origin) {
    return next();
  }

  const method = c.req.method;
  const reqId = c.get("requestId") || "unknown";

  // Prevent log poisoning / huge origins
  const safeOrigin = origin.replace(/[\r\n\t]/g, "").slice(0, 200);

  if (method === "OPTIONS") {
    console.debug(
      `[CORS] Preflight | ReqID: ${reqId} | Origin: ${safeOrigin} | Request-Method: ${
        c.req.header("Access-Control-Request-Method") || "unknown"
      }`,
    );
  } else {
    console.debug(
      `[CORS] Cross-origin request | ReqID: ${reqId} | Origin: ${safeOrigin} | Method: ${method} | Path: ${c.req.path}`,
    );
  }

  await next();
});

// Permissive CORS to accept SDK payloads from any host application
// (Can be tightened later per project/domain rules)
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    credentials: true,
  }),
);

// 2. Global Error Handling
// Catch any exceptions thrown inside routes and format them as JSON
app.onError(globalErrorHandler);

// Catch 404s and format them as JSON
app.notFound((c) => {
  const reqId = c.get("requestId") || "unknown";
  return c.json(
    {
      ok: false,
      success: false,
      error: {
        message: "Not Found",
        code: 404,
        requestId: reqId,
      },
    },
    404,
  );
});

// 3. Health & Utility Routes
app.route("/health", healthRouter);
app.route("/metrics", metricsRouter);

// 4. Ingestion API V1
app.route("/api/v1/ingest", ingestRouter);
app.route("/api/v1/projects", projectsRouter);

export default app;
