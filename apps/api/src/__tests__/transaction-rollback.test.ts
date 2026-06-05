import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "../db";
import { processTriageJob } from "../workers/triage-runner";
import type { AIProvider } from "../lib/ai";

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock("../db", () => {
  const actual = vi.importActual("../db");
  return {
    ...actual,
    pool: {
      connect: vi.fn(async () => mockClient as any),
      query: vi.fn(),
    },
    withTransaction: async (cb: any) => {
      // Re-implement simplified transaction wrapper to assert mock states
      await mockClient.query("BEGIN");
      try {
        const result = await cb(mockClient);
        await mockClient.query("COMMIT");
        return result;
      } catch (err) {
        await mockClient.query("ROLLBACK");
        throw err;
      }
    },
  };
});

const mockProvider: AIProvider = {
  invoke: vi.fn(),
};

describe("Transactional Rollback Invariant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockClient.query = vi.fn();
  });

  it("should rollback transaction and persist nothing if issue_instances insert fails", async () => {
    // 1. Mock session eligibility check
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: "sess_1",
          url: "http://localhost",
          duration_ms: 1000,
          started_at: 100,
          ended_at: 1100,
          ai_analyzed_at: null,
        },
      ],
    } as any);

    // 2. Mock timeline events with a valid fingerprint to pass validation
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { type: "js_error", timestamp_ms: 200, error_message: "Crash", fingerprint: "fp_123" }
      ]
    } as any);

    // 3. Mock candidate groups check to avoid undefined crash
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    // Mock LLM result returning create action
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify({
        session_summary: "checkout crash",
        goal_completed: false,
        friction_score: 90,
        confidence: 0.95,
        reasoning: "checkout crash",
        issue_detected: true,
        issue_group_action: "create",
        issue_group_id: null,
        issues: [
          {
            title: "Checkout 500 error",
            root_cause: "POST /checkout failed",
            suggested_fix: "Fix checkout endpoint",
            severity: "P0",
            confidence: 0.95,
            reproduction_steps: ["Step 1"],
            evidence: [],
          },
        ],
      }),
      model: "openrouter/owl-alpha",
    });

    // Mock query behavior: throw error on issue_instances insert
    mockClient.query.mockImplementation((queryText) => {
      if (queryText === "BEGIN" || queryText === "COMMIT" || queryText === "ROLLBACK") {
        return { rows: [] };
      }
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [{ status: "leased", locked_by: "test-worker" }] };
      }
      if (queryText.includes("INSERT INTO issue_groups")) {
        return { rows: [], rowCount: 1 };
      }
      if (queryText.includes("INSERT INTO issue_instances")) {
        // Simulate a database crash/failure on inserting issue instance
        throw new Error("DB Crash on insert issue_instances");
      }
      return { rows: [] };
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify BEGIN was called
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");

    // Verify ROLLBACK was called because of the error in issue_instances insert
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
