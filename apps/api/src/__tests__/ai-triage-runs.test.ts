import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "../db";
import { processTriageJob } from "../workers/triage-runner";
import type { AIProvider } from "../lib/ai";

const mockClient = {
  query: vi.fn(),
};

vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => {
    return cb(mockClient as any);
  }),
}));

const mockProvider: AIProvider = {
  invoke: vi.fn(),
};

describe("AI Triage Runs Lifecycle Logging", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockClient.query = vi.fn();
  });

  const baseSessionRow = {
    id: "sess_1",
    url: "http://localhost",
    duration_ms: 1000,
    started_at: 100,
    ended_at: 1100,
    ai_analyzed_at: null,
  };

  it("should record completed status for successful create/attach runs", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseSessionRow] } as any);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify({
        session_summary: "checkout crash",
        goal_completed: false,
        friction_score: 90,
        confidence: 0.95,
        reasoning: "checkout crash",
        issue_detected: true,
        issue_group_action: "attach",
        issue_group_id: "igr_payment_500",
      }),
      model: "openrouter/owl-alpha",
    });

    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [{ status: "leased", locked_by: "test-worker" }] };
      }
      if (queryText.includes("issue_groups") && queryText.includes("id = $1 AND project_id = $2")) {
        return { rows: [{ id: "igr_payment_500" }] };
      }
      if (queryText.includes("INSERT INTO issue_instances")) {
        return { rows: [{ id: "inst_1" }], rowCount: 1 };
      }
      return { rows: [] };
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify completed status persisted inside transaction
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      expect.arrayContaining([
        expect.any(String), // id
        "sess_1",
        "proj_1",
        "openrouter/owl-alpha",
        null, // input_tokens
        null, // output_tokens
        expect.any(Number), // created_at
        expect.any(Number), // completed_at
        1, // attempt_number
        0, // repair_count
        "sess_1", // job_id
        "completed", // status
        expect.any(Number), // duration_ms
      ])
    );
  });

  it("should record ignored status for ignore runs", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseSessionRow] } as any);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify({
        session_summary: "No friction found",
        goal_completed: true,
        friction_score: 5,
        confidence: 0.95,
        reasoning: "none",
        issue_detected: false,
        issue_group_action: "ignore",
        issue_group_id: null,
      }),
      model: "openrouter/owl-alpha",
    });

    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [{ status: "leased", locked_by: "test-worker" }] };
      }
      return { rows: [] };
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify ignored status persisted
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      expect.arrayContaining([
        expect.any(String),
        "sess_1",
        "proj_1",
        "openrouter/owl-alpha",
        null,
        null,
        expect.any(Number),
        expect.any(Number),
        1,
        0,
        "sess_1",
        "ignored", // status
      ])
    );
  });

  it("should record skipped status for not finalized sessions", async () => {
    const unfinalizedSession = {
      ...baseSessionRow,
      ended_at: null,
    };
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [unfinalizedSession] } as any);

    mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify skipped status persisted with correct parameters mapping
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      [
        expect.any(String), // id
        "sess_1", // session_id
        "proj_1", // project_id
        "session_not_finalized", // reason / error_message
        expect.any(Number), // created_at/completed_at/updated_at
        expect.any(Number), // duration_ms
      ]
    );
  });

  it("should record skipped status for already analyzed sessions", async () => {
    const analyzedSession = {
      ...baseSessionRow,
      ai_analyzed_at: 500,
    };
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [analyzedSession] } as any);

    mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify skipped status persisted with correct parameters mapping
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      [
        expect.any(String), // id
        "sess_1", // session_id
        "proj_1", // project_id
        "session_already_analyzed", // reason / error_message
        expect.any(Number), // created_at/completed_at/updated_at
        expect.any(Number), // duration_ms
      ]
    );
  });

  it("should record failed status for execution/unexpected exceptions", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseSessionRow] } as any);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    // Mock LLM call to throw error
    vi.mocked(mockProvider.invoke).mockRejectedValueOnce(new Error("LLM Network Timeout"));

    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("UPDATE triage_jobs SET")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify failed status persisted with correct parameters
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      [
        expect.any(String), // runId
        "sess_1", // session_id
        "proj_1", // project_id
        "LLM Network Timeout", // error_message
        "job_failure", // error_type
        1, // attempt_number
        "execution", // failure_stage
        expect.any(Number), // now
        "sess_1", // jobId / session_id
        expect.any(Number), // durationMs
      ]
    );
  });
});
