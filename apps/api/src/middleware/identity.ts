/**
 * @file identity.ts
 * @description Ingestion identity extraction middleware.
 * @how Parses the JSON request body once and extracts projectKey and sessionId.
 * @why Adheres to the Single Parse Principle to prevent redundant parse and CPU usage.
 */

import type { MiddlewareHandler, Context, Next } from "hono";
import { z } from "zod";

const IdentitySchema = z.object({
  projectKey: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128).optional(),
});

import type { AppEnv } from "../lib/types";

export const extractIdentityMiddleware: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const contentType = c.req.header("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return c.json(
      {
        ok: false,
        success: false,
        error: { message: "Validation Error", issues: [{ code: "custom", path: [], message: "Content-Type must be application/json" }] },
      },
      400
    );
  }

  try {
    const body = await c.req.json();
    const result = IdentitySchema.safeParse(body);

    if (!result.success) {
      return c.json(
        {
          ok: false,
          success: false,
          error: { message: "Validation Error", issues: result.error.issues },
        },
        400
      );
    }

    c.set("ingestIdentity", result.data);
    await next();
  } catch {
    return c.json(
      {
        ok: false,
        success: false,
        error: {
          message: "Validation Error",
          issues: [{ code: "custom", path: [], message: "Malformed JSON payload" }],
        },
      },
      400
    );
  }
};
