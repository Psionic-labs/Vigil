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
import type { AIProvider } from "../lib/ai";

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

// Mock the LLM provider
const mockProvider: AIProvider = {
  invoke: vi.fn(),
};

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

    // Mock successful LLM result
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      data: {
        session_summary: "Test",
        goal_completed: true,
        friction_score: 10,
        issue_detected: false,
        issue_group_action: "skipped/noise",
        issue_group_id: null,
        issues: [],
      },
      model: "openrouter/owl-alpha",
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
      provider: mockProvider,
      maxAttempts: 3,
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

    // Mock successful LLM result
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
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
      model: "openrouter/owl-alpha",
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
      provider: mockProvider,
      maxAttempts: 3,
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

  // Test Case 3: Lease Loss in Failure Handler
  // Mocks a scenario where a worker's Claude call fails, but in the meantime,
  // another worker has already reclaimed the lease.
  // Verifies that the failure handler does not overwrite the job status or attempts count.
  it("should not update database state in handleJobFailure if the worker lease was lost", async () => {
    // Mock session eligibility check to succeed
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "sess_1", url: "http://localhost", duration_ms: 1000, started_at: 100, ended_at: 1100, ai_analyzed_at: null }],
    });
    // Mock event timeline fetch
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    // Mock provider.invoke to throw a transient error
    vi.mocked(mockProvider.invoke).mockRejectedValueOnce(new Error("Transient call failure"));

    // Mock the update query in handleJobFailure to return rowCount = 0 (meaning lease lost)
    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("UPDATE triage_jobs SET")) {
        return { rows: [], rowCount: 0 }; // Lease was taken by another worker
      }
      return { rows: [] };
    });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify it attempted to update the failed status check with locked_by constraint
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'leased' AND locked_by ="),
      expect.any(Array)
    );

    // Verify the warning log was printed indicating the lease was lost
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to transition job sess_1 to failed/dead_letter because lease was lost.")
    );

    consoleWarnSpy.mockRestore();
  });

  // Test Case 4: Valid duplicate ID match with missing issues array
  // Verifies that when the model returns a valid duplicate group ID but no issues array,
  // the triage runner links the session to the group but does NOT write the hallucination warning message.
  it("should not write warning message in issue_instances for valid duplicate group matches", async () => {
    // Mock session eligibility check
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "sess_valid_dup", url: "http://localhost", duration_ms: 1000, started_at: 100, ended_at: 1100, ai_analyzed_at: null }],
    });
    // Mock event timeline fetch (which retrieves event for fingerprint extraction)
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ type: "js_error", timestamp_ms: 200, error_message: "Crash", fingerprint: "fp_valid_dup" }],
    });
    // Mock candidate groups query (which matches the fingerprint)
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "igr_valid_123", title: "Valid Group", fingerprint: "fp_valid_dup", severity: "P1", status: "open", last_seen_at: 1000 }],
    });

    // Mock LLM result returning a valid duplicate ID but no issues list
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      data: {
        session_summary: "Duplicate of valid group",
        goal_completed: true,
        friction_score: 20,
        issue_detected: true,
        issue_group_action: "duplicate issue group",
        issue_group_id: "igr_valid_123",
      },
      model: "openrouter/owl-alpha",
    });

    // Mock transaction query implementation
    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [{ status: "leased", locked_by: "test-worker" }] };
      }
      if (queryText.includes("UPDATE issue_groups")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    await processTriageJob("sess_valid_dup", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify INSERT INTO issue_instances has null root_cause and suggested_fix
    const insertInstanceCall = mockClient.query.mock.calls.find((call) =>
      call[0].includes("INSERT INTO issue_instances")
    );
    expect(insertInstanceCall).toBeDefined();
    // Args order: id, issue_group_id, session_id, project_id, title, root_cause, suggested_fix, ...
    expect(insertInstanceCall![1][5]).toBeNull(); // root_cause should be null
    expect(insertInstanceCall![1][6]).toBeNull(); // suggested_fix should be null
  });

  // Test Case 5: Invalid duplicate ID match with missing issues array
  // Verifies that when the model returns an invalid duplicate group ID and no issues array,
  // the triage runner falls back to new group creation and writes the warning message.
  it("should write warning message in issue_instances and issue_groups for invalid duplicate group matches", async () => {
    // Mock session eligibility check
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "sess_invalid_dup", url: "http://localhost", duration_ms: 1000, started_at: 100, ended_at: 1100, ai_analyzed_at: null }],
    });
    // Mock event timeline fetch
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ type: "js_error", timestamp_ms: 200, error_message: "Crash", fingerprint: "fp_invalid_dup" }],
    });
    // Mock candidate groups query (return different candidate group ID, not matching LLM's returned group ID)
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "igr_valid_123", title: "Valid Group", fingerprint: "fp_invalid_dup", severity: "P1", status: "open", last_seen_at: 1000 }],
    });

    // Mock LLM result returning an invalid duplicate ID not matching candidates
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      data: {
        session_summary: "Duplicate of invalid group",
        goal_completed: true,
        friction_score: 20,
        issue_detected: true,
        issue_group_action: "duplicate issue group",
        issue_group_id: "igr_hallucinated_999",
      },
      model: "openrouter/owl-alpha",
    });

    // Mock transaction queries
    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [{ status: "leased", locked_by: "test-worker" }] };
      }
      return { rows: [] };
    });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await processTriageJob("sess_invalid_dup", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify warnings logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("LLM returned issue_group_id igr_hallucinated_999 which is not in candidate groups")
    );

    // Verify INSERT INTO issue_groups contains the warning
    const insertGroupCall = mockClient.query.mock.calls.find((call) =>
      call[0].includes("INSERT INTO issue_groups")
    );
    expect(insertGroupCall).toBeDefined();
    expect(insertGroupCall![1][4]).toContain("Automatically created because LLM returned an invalid/hallucinated duplicate issue group ID");

    // Verify INSERT INTO issue_instances contains the warning
    const insertInstanceCall = mockClient.query.mock.calls.find((call) =>
      call[0].includes("INSERT INTO issue_instances")
    );
    expect(insertInstanceCall).toBeDefined();
    expect(insertInstanceCall![1][5]).toContain("Automatically created because LLM returned an invalid/hallucinated duplicate issue group ID");

    consoleWarnSpy.mockRestore();
  });
});

