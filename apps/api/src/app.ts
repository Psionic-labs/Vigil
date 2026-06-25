/**
 * @file app.ts
 * @description Main application configurer and router.
 * @how Integrates global middleware (CORS, RequestId, Logging, Error Handler) and binds endpoints.
 * @why Establishes a standardized pipeline for routing and sanitizing API requests.
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
import { issuesRouter } from "./routes/issues";
import { sessionsRouter } from "./routes/sessions";
import { githubRouter } from "./routes/github";
import { auth } from "./lib/auth";

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

// Dynamic CORS configuration to handle:
// 1. Public telemetry ingestion (accepts requests from any origin, no credentials needed).
// 2. Dashboard API and Auth requests (strictly requires credentials and maps origin to frontend URL).
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3002";
app.use(
  "/api/*",
  async (c, next) => {
    const path = c.req.path;
    const isIngest = path.startsWith("/api/v1/ingest");

    const handler = cors({
      origin: (origin) => {
        if (isIngest) {
          return origin || "*";
        }
        return origin === FRONTEND_URL || origin === "http://localhost:3002" ? origin : FRONTEND_URL;
      },
      allowMethods: isIngest ? ["POST", "OPTIONS"] : ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      credentials: true,
    });

    return handler(c, next);
  }
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

// 4. Wildcard Auth route handlers (Better Auth)
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// 5. Ingestion API V1 (Public telemetry)
app.route("/api/v1/ingest", ingestRouter);

// 6. Protected Dashboard APIs (Enforced at router level)
app.route("/api/v1/projects", projectsRouter);
app.route("/api/v1/issues", issuesRouter);
app.route("/api/v1/sessions", sessionsRouter);
app.route("/api/v1/github", githubRouter);

export default app;
