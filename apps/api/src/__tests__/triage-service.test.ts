/**
 * @file triage-service.test.ts
 * @description Unit tests verifying the AISchema Zod validation constraints.
 * @why AI output is highly variable. Testing schema bounds (valid structures, out-of-bound friction scores,
 *      inconsistent flag combinations, and edge cases) ensures that incorrect LLM telemetry is never persisted.
 */

import { describe, it, expect } from "vitest";
import { AISchema } from "../workers/triage-service";

// Valid base payloads for reuse across tests
const validSkippedOutput = {
  session_summary: "User browsed the homepage with no issues.",
  goal_completed: true,
  friction_score: 5,
  confidence: 0.95,
  reasoning: "No friction/errors detected in the telemetry.",
  issue_detected: false,
  issue_group_action: "ignore",
  issue_group_id: null,
};

const validNewIssueOutput = {
  session_summary: "User encountered checkout error.",
  goal_completed: false,
  friction_score: 95,
  confidence: 0.9,
  reasoning: "Multiple checkout crash errors identified.",
  issue_detected: true,
  issue_group_action: "create",
  issue_group_id: null,
  issues: [
    {
      title: "Payment fail 500",
      root_cause: "POST /api/pay returned 500",
      suggested_fix: "Fix pay endpoint",
      severity: "P0",
      confidence: 0.95,
      reproduction_steps: ["Go to check out", "Click pay"],
      evidence: [
        {
          type: "network_error",
          timestamp_ms: 100,
          detail: "500 error",
        },
      ],
    },
  ],
};

const validDuplicateOutput = {
  session_summary: "User hit known login bug.",
  goal_completed: false,
  friction_score: 80,
  confidence: 0.85,
  reasoning: "Error fingerprint matches known duplicate issue group.",
  issue_detected: true,
  issue_group_action: "attach",
  issue_group_id: "igr_abc123",
};

describe("AISchema Zod Validation", () => {
  // --- Valid Structures ---

  it("should accept valid ignore output", () => {
    const result = AISchema.safeParse(validSkippedOutput);
    expect(result.success).toBe(true);
  });

  it("should accept valid create output", () => {
    const result = AISchema.safeParse(validNewIssueOutput);
    expect(result.success).toBe(true);
  });

  it("should accept valid attach output", () => {
    const result = AISchema.safeParse(validDuplicateOutput);
    expect(result.success).toBe(true);
  });

  it("should reject ignore with empty issues array", () => {
    const result = AISchema.safeParse({
      ...validSkippedOutput,
      issues: [],
    });
    expect(result.success).toBe(false);
  });

  // --- Constraint Violations ---

  it("should reject friction_score out of range", () => {
    const result = AISchema.safeParse({ ...validSkippedOutput, friction_score: 120 });
    expect(result.success).toBe(false);
  });

  it("should reject negative friction_score", () => {
    const result = AISchema.safeParse({ ...validSkippedOutput, friction_score: -5 });
    expect(result.success).toBe(false);
  });

  it("should reject missing required fields", () => {
    const incomplete: Partial<typeof validSkippedOutput> = { ...validSkippedOutput };
    delete incomplete.goal_completed;
    const result = AISchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("should reject empty string issue_group_id", () => {
    const result = AISchema.safeParse({
      ...validNewIssueOutput,
      issue_group_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject unknown extra fields (strict mode)", () => {
    const result = AISchema.safeParse({
      ...validSkippedOutput,
      unknown_field: "should not be here",
    });
    expect(result.success).toBe(false);
  });

  // --- Inconsistent State Combinations ---

  it("should reject issue_detected=false with non-ignored action", () => {
    const result = AISchema.safeParse({
      ...validSkippedOutput,
      issue_group_action: "create",
    });
    expect(result.success).toBe(false);
  });

  it("should reject issue_detected=false with issue_group_id present", () => {
    const result = AISchema.safeParse({
      ...validSkippedOutput,
      issue_group_id: "igr_123",
    });
    expect(result.success).toBe(false);
  });

  it("should reject issue_detected=false with non-empty issues array", () => {
    const result = AISchema.safeParse({
      ...validSkippedOutput,
      issues: validNewIssueOutput.issues,
    });
    expect(result.success).toBe(false);
  });

  it("should reject issue_detected=true with ignore action", () => {
    const result = AISchema.safeParse({
      session_summary: "Issue detected",
      goal_completed: false,
      friction_score: 80,
      issue_detected: true,
      issue_group_action: "ignore",
    });
    expect(result.success).toBe(false);
  });

  it("should reject create action with non-null issue_group_id", () => {
    const result = AISchema.safeParse({
      ...validNewIssueOutput,
      issue_group_id: "igr_abc123",
    });
    expect(result.success).toBe(false);
  });

  it("should reject create action with empty issues array", () => {
    const result = AISchema.safeParse({
      ...validNewIssueOutput,
      issues: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject attach action with null issue_group_id", () => {
    const result = AISchema.safeParse({
      ...validDuplicateOutput,
      issue_group_id: null,
    });
    expect(result.success).toBe(false);
  });

  it("should reject attach action with undefined issue_group_id", () => {
    const result = AISchema.safeParse({
      ...validDuplicateOutput,
      issue_group_id: undefined,
    });
    expect(result.success).toBe(false);
  });

  // --- Boundary Values ---

  it("should accept friction_score at boundaries (0 and 100)", () => {
    expect(AISchema.safeParse({ ...validSkippedOutput, friction_score: 0 }).success).toBe(true);
    expect(AISchema.safeParse({ ...validSkippedOutput, friction_score: 100 }).success).toBe(true);
  });

  it("should accept confidence at boundaries (0 and 1)", () => {
    const issues = [{ ...validNewIssueOutput.issues![0], confidence: 0 }];
    expect(AISchema.safeParse({ ...validNewIssueOutput, issues }).success).toBe(true);

    const issues2 = [{ ...validNewIssueOutput.issues![0], confidence: 1 }];
    expect(AISchema.safeParse({ ...validNewIssueOutput, issues: issues2 }).success).toBe(true);
  });

  it("should reject confidence out of range", () => {
    const issues = [{ ...validNewIssueOutput.issues![0], confidence: 1.5 }];
    expect(AISchema.safeParse({ ...validNewIssueOutput, issues }).success).toBe(false);
  });
});
