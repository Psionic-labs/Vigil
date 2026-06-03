/**
 * @file issue-group-actions.test.ts
 * @description Unit tests verifying transactional issue group actions (create, attach, ignore)
 *              including duplicate protections, validation, and idempotency guards.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createIssueGroup, attachIssueGroup } from "../workers/triage/issue-group-actions";
import { AIValidationError } from "../lib/ai";
import type { AITriageOutput } from "../workers/triage-service";

describe("issue-group-actions", () => {
  const mockClient = {
    query: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const triageData: AITriageOutput = {
    session_summary: "checkout crash",
    goal_completed: false,
    friction_score: 90,
    confidence: 0.95,
    reasoning: "encountered a crash on checkout",
    issue_detected: true,
    issue_group_action: "create" as const,
    issue_group_id: null,
    issues: [
      {
        title: "Checkout 500 error",
        root_cause: "POST /checkout failed",
        suggested_fix: "Fix checkout endpoint",
        severity: "P0" as const,
        confidence: 0.95,
        reproduction_steps: ["Step 1", "Step 2"],
        evidence: [{ type: "js_error", timestamp_ms: 12345, detail: "Error details" }],
      },
    ],
  };

  describe("createIssueGroup", () => {
    it("should throw AIValidationError if fingerprint is missing", async () => {
      await expect(
        createIssueGroup(mockClient as any, "proj_1", null, triageData, 1000, "sess_1")
      ).rejects.toThrow(AIValidationError);
    });

    it("should insert a new issue group and return a new ID if no duplicate exists", async () => {
      // 1. Mock duplicate check to return no existing group
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 2. Mock group insert query to resolve
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const groupId = await createIssueGroup(mockClient as any, "proj_1", "fp_123", triageData, 1000, "sess_1");

      expect(groupId).toBeDefined();
      expect(groupId).toMatch(/^igr_[a-f0-9]{16}$/);

      // Verify the duplicate protection check ran
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        `SELECT id FROM issue_groups WHERE project_id = $1 AND fingerprint = $2 LIMIT 1`,
        ["proj_1", "fp_123"]
      );

      // Verify the insert query ran with correct parameters
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("INSERT INTO issue_groups"),
        [
          groupId,
          "proj_1",
          "fp_123",
          triageData.issues![0]!.title,
          triageData.issues![0]!.root_cause,
          triageData.issues![0]!.suggested_fix,
          triageData.issues![0]!.severity,
          triageData.issues![0]!.confidence,
          JSON.stringify(triageData.issues![0]!.reproduction_steps),
          JSON.stringify(triageData.issues![0]!.evidence),
          1000,
        ]
      );
    });

    it("should delegate to attachIssueGroup and return existing ID if duplicate fingerprint exists", async () => {
      // 1. Mock duplicate check to find existing group
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: "igr_existing_123" }] });
      // 2. Mock attach validation check to find the group
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: "igr_existing_123" }] });

      const groupId = await createIssueGroup(mockClient as any, "proj_1", "fp_123", triageData, 1000, "sess_1");

      expect(groupId).toBe("igr_existing_123");

      // Verify attach flow queries were run
      expect(mockClient.query).toHaveBeenCalledWith(
        `SELECT id FROM issue_groups WHERE id = $1 AND project_id = $2`,
        ["igr_existing_123", "proj_1"]
      );
    });

    it("should handle unique index violation (23505) by querying existing duplicate group and attaching", async () => {
      // 1. Mock first duplicate check to return nothing (meaning not found)
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      
      // 2. Mock INSERT to throw a 23505 unique violation error
      const uniqueViolationErr = new Error("unique constraint violation");
      (uniqueViolationErr as any).code = "23505";
      mockClient.query.mockRejectedValueOnce(uniqueViolationErr);
      
      // 3. Mock second duplicate check (retry query) to find the concurrently created group
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: "igr_concurrent_456" }] });
      
      // 4. Mock attach validation check to find the group
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: "igr_concurrent_456" }] });

      const groupId = await createIssueGroup(mockClient as any, "proj_1", "fp_123", triageData, 1000, "sess_1");

      expect(groupId).toBe("igr_concurrent_456");

      // Verify it ran duplicate check, insert, retry duplicate check, attach validation.
      expect(mockClient.query).toHaveBeenCalledWith(
        `SELECT id FROM issue_groups WHERE project_id = $1 AND fingerprint = $2 LIMIT 1`,
        ["proj_1", "fp_123"]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO issue_groups"),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        `SELECT id FROM issue_groups WHERE id = $1 AND project_id = $2`,
        ["igr_concurrent_456", "proj_1"]
      );
    });
  });

  describe("attachIssueGroup", () => {
    it("should throw AIValidationError if target group is not found in the project", async () => {
      // 1. Mock group validation check to return nothing (meaning group not found or belongs to another project)
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        attachIssueGroup(mockClient as any, "proj_1", "igr_other_999", 1000, "sess_1")
      ).rejects.toThrow(AIValidationError);

      expect(mockClient.query).toHaveBeenCalledWith(
        `SELECT id FROM issue_groups WHERE id = $1 AND project_id = $2`,
        ["igr_other_999", "proj_1"]
      );
    });

    it("should validate and return group ID if found in the project", async () => {
      // 1. Mock validation check to succeed
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: "igr_123" }] });

      const res = await attachIssueGroup(mockClient as any, "proj_1", "igr_123", 1000, "sess_1");

      expect(res).toBe("igr_123");
      expect(mockClient.query).toHaveBeenCalledWith(
        `SELECT id FROM issue_groups WHERE id = $1 AND project_id = $2`,
        ["igr_123", "proj_1"]
      );
    });
  });
});
