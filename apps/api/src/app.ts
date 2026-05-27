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
import ingestRouter from "./routes/ingest";

// Define strict typing for application state/variables if needed later
type AppBindings = {
  Variables: {
    requestId: string;
  };
};

const app = new Hono<AppBindings>();

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

// 4. Ingestion API V1
app.route("/api/v1/ingest", ingestRouter);

export default app;
