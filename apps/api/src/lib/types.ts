/**
 * @file types.ts
 * @description Ingestion contexts and application environment type definitions.
 * @why Enforces compiler guarantees on values shared on Hono context variables throughout the request pipeline.
 */

import type { ProjectCacheEntry } from "./rate-limit-store";

/**
 * IngestIdentity
 * Extracted identification payload containing project credentials and optional session key.
 */
export interface IngestIdentity {
  projectKey: string;     // Public project key credential
  sessionId?: string;     // Optional session identifier
}

/**
 * AppEnv
 * Declares variables stored on Hono's context (`c.set`/`c.get`) to communicate details between middlewares and routes.
 */
export type AppEnv = {
  Variables: {
    requestId: string;                      // Correlation ID tracking request logs
    ingestIdentity?: IngestIdentity;        // Extracted identity headers/body params
    projectId?: string;                     // Validated database project identifier
    projectCacheEntry?: ProjectCacheEntry | null; // Cached lookup outcome shared across middlewares
  };
};
