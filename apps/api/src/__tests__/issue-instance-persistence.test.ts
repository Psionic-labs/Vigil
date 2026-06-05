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

describe("Issue Instance Persistence & Counter Correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should insert issue_instance and increment count for a create action", async () => {
    // 1. Mock session eligibility check
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseSessionRow] } as any);
    // 2. Mock timeline events with a valid fingerprint to pass creation validation
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { type: "js_error", timestamp_ms: 200, error_message: "Crash", fingerprint: "fp_123" }
      ]
    } as any);
    // 3. Mock candidate groups check
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    // Mock LLM result returning create action
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify({
        session_summary: "checkout crash",
        goal_completed: false,
        friction_score: 90,
        confidence: 0.95,
        reasoning: "encountered checkout crash",
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

    // Mock transaction query implementation
    mockClient.query.mockImplementation((queryText) => {
      if (queryText.includes("triage_jobs") && queryText.includes("locked_by = $2")) {
        return { rows: [{ status: "leased", locked_by: "test-worker" }] };
      }
      if (queryText.includes("INSERT INTO issue_groups")) {
        return { rows: [], rowCount: 1 };
      }
      if (queryText.includes("INSERT INTO issue_instances")) {
        // Return 1 row to signal successful insert (new instance)
        return { rows: [{ id: "inst_1" }], rowCount: 1 };
      }
      return { rows: [] };
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify issue group created
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO issue_groups"),
      expect.any(Array)
    );

    // Verify issue instance inserted with all missing columns
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO issue_instances"),
      expect.arrayContaining([
        expect.any(String), // instanceId
        expect.any(String), // targetGroupId
        "sess_1",
        "proj_1",
        "Checkout 500 error",
        "POST /checkout failed",
        "Fix checkout endpoint",
        "P0",
        100, // detected_at/timestamp_ms
        0.95, // confidence
        "[]", // evidence_json
        "[\"Step 1\"]", // reproduction_json
        expect.any(Number), // created_at
        "fp_123", // fingerprint
        0.95, // ai_confidence
        100, // detected_at
        expect.any(Number), // updated_at
      ])
    );

    // Verify counter incremented on issue_groups (checking substring to ignore spacing/newlines)
    const updateCall = mockClient.query.mock.calls.find(
      c => c[0].includes("UPDATE issue_groups") && c[0].includes("affected_session_count = affected_session_count + 1")
    );
    expect(updateCall).toBeDefined();
  });

  it("should insert issue_instance and increment count for an attach action", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseSessionRow] } as any);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify({
        session_summary: "checkout duplicate crash",
        goal_completed: false,
        friction_score: 90,
        confidence: 0.95,
        reasoning: "duplicate of known crash",
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
        // Validation check succeeds
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

    // Verify attach actions validated the group ID
    expect(mockClient.query).toHaveBeenCalledWith(
      `SELECT id FROM issue_groups WHERE id = $1 AND project_id = $2`,
      ["igr_payment_500", "proj_1"]
    );

    // Verify instance inserted
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO issue_instances"),
      expect.any(Array)
    );

    // Verify counter incremented on issue_groups
    const updateCall = mockClient.query.mock.calls.find(
      c => c[0].includes("UPDATE issue_groups") && c[0].includes("affected_session_count = affected_session_count + 1")
    );
    expect(updateCall).toBeDefined();
  });

  it("should not insert issue_instance or increment count for ignore action", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseSessionRow] } as any);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify({
        session_summary: "Browsed home with no issue",
        goal_completed: true,
        friction_score: 5,
        confidence: 0.95,
        reasoning: "No issues found",
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

    // Verify no issue_instances or issue_groups insert/update was called
    const insertInstance = mockClient.query.mock.calls.find(c => c[0].includes("INSERT INTO issue_instances"));
    const insertGroup = mockClient.query.mock.calls.find(c => c[0].includes("INSERT INTO issue_groups"));
    const updateGroup = mockClient.query.mock.calls.find(c => c[0].includes("UPDATE issue_groups"));

    expect(insertInstance).toBeUndefined();
    expect(insertGroup).toBeUndefined();
    expect(updateGroup).toBeUndefined();
  });

  it("should skip counter increment if issue_instances insert returns rowCount = 0 (conflict replay/retry)", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseSessionRow] } as any);
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify({
        session_summary: "checkout duplicate crash",
        goal_completed: false,
        friction_score: 90,
        confidence: 0.95,
        reasoning: "duplicate of known crash",
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
        // Row conflict occurred -> returns 0 rows inserted
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify instance insert was attempted
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO issue_instances"),
      expect.any(Array)
    );

    // Verify counter update query was NOT called (rowCount was 0)
    const updateGroupCall = mockClient.query.mock.calls.find(c => c[0].includes("UPDATE issue_groups SET"));
    expect(updateGroupCall).toBeUndefined();
  });
});
