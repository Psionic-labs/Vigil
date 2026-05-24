import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { requestIdMiddleware } from "./middleware/request-id";
import { globalErrorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health";

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

// Permissive CORS to accept SDK payloads from any host application
// (Can be tightened later per project/domain rules)
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  })
);

// 2. Global Error Handling
// Catch any exceptions thrown inside routes and format them as JSON
app.onError(globalErrorHandler);

// Catch 404s and format them as JSON
app.notFound((c) => {
  const reqId = c.get("requestId") || "unknown";
  return c.json(
    {
      success: false,
      error: {
        message: "Not Found",
        code: 404,
        requestId: reqId,
      },
    },
    404
  );
});

// 3. Health & Utility Routes
app.route("/health", healthRouter);

// 4. Ingestion API V1 Prefix (Placeholder for future routes)
// app.route("/api/v1", ingestionRouter);

export default app;
