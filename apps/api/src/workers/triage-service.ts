/**
 * @file triage-service.ts
 * @description Defines the Zod validation schema and type for AI triage outputs.
 * @why AI output is highly variable. Using Zod guarantees type-safety and field value bounds on model outputs
 *      before attempting database writes. The schema is provider-agnostic and shared across all AIProvider implementations.
 */

import { z } from "zod";

// Zod Validation Schema for strict output parsing.
// Enforces types, string lengths, ranges, and structures for the AI triage findings.
export const AISchema = z.object({
  session_summary: z.string().max(2000),      // Summarized description of the user's session
  goal_completed: z.boolean(),                 // Flag stating if user accomplished their task
  friction_score: z.number().int().min(0).max(100), // Score representing estimated frustration levels (0-100)
  issue_detected: z.boolean(),                 // Flag stating if a real bug/issue is identified
  issue_group_action: z.enum(["skipped/noise", "duplicate issue group", "new issue group"]), // Categorization decision
  issue_group_id: z.string().min(1).max(255).optional().nullable(), // Target issue group to attach if duplicate
  issues: z.array(
    z.object({
      title: z.string().max(500),              // Summarized title of the issue
      root_cause: z.string().max(2000),        // In-depth telemetry root cause analysis
      suggested_fix: z.string().max(2000),     // Suggested actionable fix steps
      severity: z.enum(["P0", "P1", "P2", "P3"]), // Priority classification
      confidence: z.number().min(0).max(1),    // Level of certainty of the classification (0-1)
      reproduction_steps: z.array(z.string().max(1000)).max(20), // Steps to reproduce
      evidence: z.array(
        z.object({
          type: z.string().max(100),           // Evidence source type (e.g. 'js_error')
          timestamp_ms: z.number().int().nonnegative(), // Evidence event timestamp
          detail: z.string().max(1000),        // Specific telemetry log snippet
        })
      ).max(50),
    })
  ).max(5).optional().nullable(),
}).strict().refine((data) => {
  // Refinement Check: enforces logical consistency.
  if (!data.issue_detected) {
    // If no issue is detected, action must be skipped/noise and no group ID or issues should be provided.
    if (data.issue_group_action !== "skipped/noise") return false;
    if (data.issue_group_id !== null && data.issue_group_id !== undefined) return false;
    if (data.issues !== null && data.issues !== undefined && data.issues.length > 0) return false;
  } else {
    // If an issue is detected, action cannot be skipped/noise
    if (data.issue_group_action === "skipped/noise") return false;

    if (data.issue_group_action === "duplicate issue group") {
      // Must have a target issue_group_id
      if (data.issue_group_id === null || data.issue_group_id === undefined) return false;
    } else if (data.issue_group_action === "new issue group") {
      // Cannot have issue_group_id, and must have at least one issue detail
      if (data.issue_group_id !== null && data.issue_group_id !== undefined) return false;
      if (!data.issues || data.issues.length === 0) return false;
    }
  }
  return true;
}, {
  message: "Inconsistent combination of issue_detected, issue_group_action, issue_group_id, and issues",
  path: ["issue_group_action"]
});

export type AITriageOutput = z.infer<typeof AISchema>;

/**
 * LLMResult is now defined in lib/ai/provider.ts as part of the provider-agnostic abstraction.
 * Re-export here for backward compatibility with any code that imports from this module.
 */
export type { LLMResult } from "../lib/ai/provider";

