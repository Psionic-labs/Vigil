/**
 * @file error-handler.ts
 * @description Global exception handler middleware.
 * @how Intercepts Zod Validation and runtime exceptions, formatting them into standardized JSON.
 * @why Avoids leaking internal node/database stack traces and ensures clean client communication.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

// Define an interface since HTTPResponseError isn't easily exportable from all Hono versions
interface HTTPResponseError extends Error {
  status: number;
}

/**
 * Global Error Handler
 * Ensures that any unhandled exception during ingestion is returned as a 
 * structured JSON object instead of leaking stack traces or returning HTML.
 */
export function globalErrorHandler(err: Error | HTTPResponseError, c: Context) {
  const reqId = c.get("requestId") || "unknown";

  if (err instanceof ZodError) {
    console.error(`[ValidationError] RequestID: ${reqId}`, err.issues);
    return c.json(
      {
        success: false,
        error: {
          message: "Validation Error",
          code: 400,
          requestId: reqId,
          issues: err.issues,
        },
      },
      400
    );
  }
  
  // Hono uses HTTPResponseError for `c.throw` calls and HTTP Exceptions
  let status = "status" in err ? err.status : 500;
  
  if (typeof status !== "number" || !Number.isInteger(status) || status < 200 || status > 599) {
    status = 500;
  }
  
  // Log the error natively. In production, this would be wired to an observability tool.
  console.error(`[Error] RequestID: ${reqId} | Status: ${status}`, err);

  return c.json(
    {
      success: false,
      error: {
        message: status === 500 ? "Internal Server Error" : err.message,
        code: status,
        requestId: reqId,
      },
    },
    status as ContentfulStatusCode
  );
}
