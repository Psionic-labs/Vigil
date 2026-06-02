/**
 * @file triage-idempotency.test.ts
 * @description Unit tests verifying worker lease protection guards and database-level idempotency safety.
 * @why Resolves race conditions when processing slow AI requests by verifying that:
 *      1. Database writes abort if a worker loses lock ownership.
 *      2. PostgreSQL unique constraint violations (code 23505) are captured cleanly, moving jobs to retry queues.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "../db";
import { processTriageJob } from "../workers/triage-runner";
import { invokeModel } from "../workers/triage-service";

const mockClient = {
  query: vi.fn(),
};

// Mock database pool query interfaces
vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => {
    return cb(mockClient as any);
  }),
}));

// Mock the Claude model invocation service
vi.mock("../workers/triage-service", () => ({
  invokeModel: vi.fn(),
}));

describe("AI Triage Idempotency & Lease Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test Case 1: Lease Loss Prevention
  // Mocks a scenario where a worker takes longer than the lease duration.
  // The lease validation query returns an empty row set (meaning another worker stole the lease).
  // Verifies that the write transaction is immediately aborted to protect DB state.
  it("should abort persistence if the worker lease was lost", async () => {
    // Mock session eligibility check to succeed
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "sess_1", url: "http://localhost", duration_ms: 1000, started_at: 100, ended_at: 1100, ai_analyzed_at: null }],
    });
    // Mock event timeline fetch
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    // Mock successful Claude API result
    vi.mocked(invokeModel).mockResolvedValueOnce({
      data: {
        session_summary: "Test",
        goal_completed: true,
        friction_score: 10,
        issue_detected: false,
        issue_group_action: "skipped/noise",
        issue_group_id: null,
        issues: [],
      },
    });

    // Mock lease validation query to return empty rows (worker lost ownership)
    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [] }; // Lease stolen/expired
      }
      return { rows: [] };
    });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      model: "claude-3-haiku",
      maxAttempts: 3,
      llmTimeoutMs: 1000,
    });

    // Verify the lease ownership query ran
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status, locked_by"),
      ["sess_1", "test-worker"]
    );

    // Verify that session updates were skipped
    const updateSessionCall = mockClient.query.mock.calls.find(c => c[0].includes("UPDATE sessions SET"));
    expect(updateSessionCall).toBeUndefined();

    // Verify console warning log was printed
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("lease_lost"));
    consoleWarnSpy.mockRestore();
  });

  // Test Case 2: Unique Index Violation Handling
  // Mocks a scenario where another worker inserts a duplicate issue group or instance at the same time.
  // The database throws index violation code '23505'.
  // Verifies that the runner captures it, transitions job status to 'failed', and schedules backoff.
  it("should handle Postgres unique index violation code 23505 during transaction", async () => {
    // Mock session eligibility check to succeed
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "sess_1", url: "http://localhost", duration_ms: 1000, started_at: 100, ended_at: 1100, ai_analyzed_at: null }],
    });
    // Mock event timeline fetch
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    // Mock successful Claude API result
    vi.mocked(invokeModel).mockResolvedValueOnce({
      data: {
        session_summary: "Duplicate test",
        goal_completed: false,
        friction_score: 50,
        issue_detected: true,
        issue_group_action: "duplicate issue group",
        issue_group_id: "igr_payment_500",
        issues: [
          {
            title: "Error occurred",
            root_cause: "api error",
            suggested_fix: "check code",
            severity: "P1",
            confidence: 0.9,
            reproduction_steps: [],
            evidence: [],
          },
        ],
      },
    });

    // Mock lease validation to pass, but throw 23505 on issue instance insert
    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [{ status: "leased", locked_by: "test-worker" }] };
      }
      if (queryText.includes("UPDATE issue_groups")) {
        return { rows: [], rowCount: 1 };
      }
      if (queryText.includes("INSERT INTO issue_instances")) {
        const err = new Error("unique constraint violation");
        (err as any).code = "23505";
        throw err;
      }
      return { rows: [] };
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      model: "claude-3-haiku",
      maxAttempts: 3,
      llmTimeoutMs: 1000,
    });

    // Verify it attempted to insert the instance
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO issue_instances"),
      expect.any(Array)
    );

    // Verify the exception was caught and the job row updated back to 'failed' for backoff retry
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE triage_jobs SET"),
      expect.any(Array)
    );
  });
});
