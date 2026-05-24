import { z } from "zod";

const SummaryEventSchema = z.object({
  type: z.enum([
    "js_error",
    "rage_click",
    "dead_click",
    "network_error",
    "navigation",
    "console_error",
    "click",
    "significant_click"
  ]),
  timestampMs: z.number().int().positive(),
  target: z.unknown().optional(),
  
  // JS/Console error fields
  errorMessage: z.string().max(5000).optional(),
  errorStack: z.string().max(10000).optional(),
  message: z.string().max(5000).optional(),
  stack: z.string().max(10000).optional(),
  source: z.string().max(2048).optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  handled: z.boolean().optional(),
  timestamp: z.number().int().positive().optional(),
  argumentSummaries: z.array(z.string().max(2000)).optional(),

  // Network error fields
  networkUrl: z.string().max(2048).optional(),
  networkStatus: z.number().int().optional(),
  networkMethod: z.string().max(20).optional(),

  // Rage click fields
  clickCount: z.number().int().optional(),
  area: z.object({
    minX: z.number(),
    maxX: z.number(),
    minY: z.number(),
    maxY: z.number()
  }).optional(),

  // Dead click fields
  x: z.number().optional(),
  y: z.number().optional(),
  waitTimeMs: z.number().optional(),

  // Navigation fields
  navFrom: z.string().max(2048).optional(),
  navTo: z.string().max(2048).optional(),
  navigationType: z.enum(["pushState", "replaceState", "popstate", "hashchange"]).optional(),
}).strict();

const SessionMetadataSchema = z.object({
  url: z.string().max(2048),
  userAgent: z.string().max(1000),
  startedAt: z.number().int().positive(),
  screenWidth: z.number().int().positive(),
  screenHeight: z.number().int().positive(),
  environment: z.enum(["development", "preview", "production"]).optional(),
  release: z.string().max(255).optional(),
  commitSha: z.string().max(255).optional(),
  userId: z.string().max(255).optional(),
}).strict();

export const IngestPayloadSchema = z.object({
  projectKey: z.string().min(1).max(255),
  sessionId: z.string().min(1).max(255),
  metadata: SessionMetadataSchema,
  summary: z.array(SummaryEventSchema).max(50),
  events: z.array(z.unknown()).max(500),
  isFinal: z.boolean(),
  sdkVersion: z.string().max(50)
}).strict();

export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
export type SummaryEvent = z.infer<typeof SummaryEventSchema>;
