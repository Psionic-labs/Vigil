/**
 * @file triage-service.test.ts
 * @description Unit tests verifying the LLM client request formatting, block extraction, and Zod validation constraints.
 * @why AI output is highly variable. Testing extraction filters and Schema bounds (valid JSON blocks, out-of-bound friction scores,
 *      and provider connection failures) ensures that incorrect LLM telemetry is never persisted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeModel } from "../workers/triage-service";

describe("AI Triage Service API Client & Parser", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test_key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Test Case 1: JSON Block Extraction
  // Verifies that JSON wrapped inside markdown code blocks (```json ... ```)
  // is successfully sliced out, parsed, and validated against the Zod schema.
  it("should successfully extract JSON blocks and parse matching schema output", async () => {
    const validJsonOutput = {
      session_summary: "User encountered checkout error.",
      goal_completed: false,
      friction_score: 95,
      issue_detected: true,
      issue_group_action: "new issue group",
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

    // Spy on global fetch API to mock Anthropic HTTP response
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            text: `Here is the analysis:\n\`\`\`json\n${JSON.stringify(validJsonOutput)}\n\`\`\``,
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    } as any);

    const result = await invokeModel("claude-3-haiku", "Test Prompt");

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.data).toEqual(validJsonOutput);
    expect(result.input_tokens).toBe(100);
    expect(result.output_tokens).toBe(50);

    fetchSpy.mockRestore();
  });

  // Test Case 2: Zod Schema Constraint Violations
  // Verifies that invalid structures (e.g. missing keys, scores out of bounds,
  // or missing group ids on duplicate attachments) are captured and rejected.
  it("should fail validation and throw error if LLM JSON output violates schema constraints", async () => {
    const invalidJsonOutput = {
      session_summary: "Bad data",
      // missing goal_completed flag
      friction_score: 120, // out of range limit (0-100)
      issue_detected: true,
      issue_group_action: "duplicate issue group",
      issue_group_id: null, // invalid: required to be non-null for duplicate actions
    };

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify(invalidJsonOutput),
          },
        ],
      }),
    } as any);

    await expect(invokeModel("claude-3-haiku", "Test Prompt")).rejects.toThrow(
      /LLM JSON output did not conform to the schema/
    );

    fetchSpy.mockRestore();
  });

  // Test Case 3: Zod Schema Inconsistent State Combinations
  // Verifies that inconsistent combinations of flags are rejected.
  it("should fail validation for inconsistent schema states", async () => {
    const testCases = [
      {
        session_summary: "No issue",
        goal_completed: true,
        friction_score: 10,
        issue_detected: false,
        issue_group_action: "new issue group", // Invalid: action must be skipped/noise if no issue
        issue_group_id: null,
      },
      {
        session_summary: "No issue",
        goal_completed: true,
        friction_score: 10,
        issue_detected: false,
        issue_group_action: "skipped/noise",
        issue_group_id: "igr_123", // Invalid: group ID must not be present if no issue
      },
      {
        session_summary: "Issue detected",
        goal_completed: false,
        friction_score: 80,
        issue_detected: true,
        issue_group_action: "skipped/noise", // Invalid: action cannot be skipped/noise if issue_detected is true
      },
      {
        session_summary: "Issue detected",
        goal_completed: false,
        friction_score: 80,
        issue_detected: true,
        issue_group_action: "new issue group",
        issue_group_id: "igr_123", // Invalid: new group action should not have group ID
        issues: [
          {
            title: "Error 500",
            root_cause: "Crash",
            suggested_fix: "Fix it",
            severity: "P1",
            confidence: 0.9,
            reproduction_steps: [],
            evidence: [],
          }
        ]
      }
    ];

    for (const testCase of testCases) {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify(testCase),
            },
          ],
        }),
      } as any);

      await expect(invokeModel("claude-3-haiku", "Test Prompt")).rejects.toThrow(
        /LLM JSON output did not conform to the schema/
      );

      fetchSpy.mockRestore();
    }
  });

  // Test Case 3: HTTP Network Failures
  // Verifies that API connection timeouts or server outages (e.g. HTTP 500)
  // throw exceptions, triggering subsequent worker queue retries.
  it("should throw error if fetch network call fails", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as any);

    await expect(invokeModel("claude-3-haiku", "Test Prompt")).rejects.toThrow(
      /Anthropic API request failed with status 500/
    );

    fetchSpy.mockRestore();
  });
});
