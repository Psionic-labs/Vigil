/**
 * @file triage-repair.test.ts
 * @description Unit tests verifying the AI validation repair loop, failure stages logging,
 *              and database updates/metrics.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool, withTransaction } from "../db";
import { processTriageJob } from "../workers/triage-runner";
import type { AIProvider } from "../lib/ai";

// Mock the database pool and transactions interface.
vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => {
    const client = { query: vi.fn() };
    await cb(client as any);
    return client;
  }),
}));

// Mock provider
const mockProvider: AIProvider = {
  invoke: vi.fn(),
};

const validTriageResponse = {
  session_summary: "User successfully checked out.",
  goal_completed: true,
  friction_score: 10,
  confidence: 0.95,
  reasoning: "Telemetry logs indicate checkout flow succeeded with zero errors.",
  issue_detected: false,
  issue_group_action: "skipped/noise",
  issue_group_id: null,
};

describe("AI Triage Output Validation and Repair Loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should attempt repair on JSON parse failure and succeed if repair returns valid JSON", async () => {
    // 1. Mock session eligibility check to succeed
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

    // 2. Mock timeline events fetch
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    // 3. Mock first invoke of provider returning malformed text
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: "malformed text here",
      model: "openrouter/owl-alpha",
      input_tokens: 100,
      output_tokens: 50,
    });

    // 4. Mock second invoke (repair) returning valid JSON
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify(validTriageResponse),
      model: "openrouter/owl-alpha",
      input_tokens: 150,
      output_tokens: 75,
    });

    const mockClient = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ status: "leased" }] }) };
    vi.mocked(withTransaction).mockImplementationOnce(async (cb) => {
      return cb(mockClient as any);
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify initial validation failure logged as 'repairing'
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      expect.arrayContaining([
        "sess_1",
        "proj_1",
        "json_parse_failed",
      ])
    );
    const repairRunCall = vi.mocked(pool.query).mock.calls.find(c => c[0].includes("INSERT INTO ai_triage_runs") && c[0].includes("'repairing'"));
    expect(repairRunCall).toBeDefined();
    expect(repairRunCall![0]).toContain("1, 'validation'");

    // Verify successful repair persists to sessions with enrichment columns
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions SET"),
      expect.arrayContaining([
        validTriageResponse.session_summary,
        validTriageResponse.goal_completed,
        validTriageResponse.friction_score,
        validTriageResponse.confidence,
        validTriageResponse.reasoning,
        "sess_1",
      ])
    );

    // Verify successful repair writes final run as 'completed'
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      expect.arrayContaining([
        2, // attempt_number
        1, // repair_count
      ])
    );
    const completedRunCall = mockClient.query.mock.calls.find(c => c[0].includes("INSERT INTO ai_triage_runs") && c[0].includes("'completed'"));
    expect(completedRunCall).toBeDefined();
  });

  it("should attempt repair on Schema validation failure and throw if repair also fails", async () => {
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

    // 2. Mock timeline events fetch
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    // 3. Mock first invoke returning JSON missing required root confidence field
    const schemaInvalidJson = {
      session_summary: "No confidence here",
      goal_completed: true,
      friction_score: 5,
      reasoning: "Missed confidence",
      issue_detected: false,
      issue_group_action: "skipped/noise",
      issue_group_id: null,
    };
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: JSON.stringify(schemaInvalidJson),
      model: "openrouter/owl-alpha",
      input_tokens: 100,
      output_tokens: 50,
    });

    // 4. Mock second invoke (repair) returning another malformed text response
    vi.mocked(mockProvider.invoke).mockResolvedValueOnce({
      rawContent: "another bad output",
      model: "openrouter/owl-alpha",
      input_tokens: 150,
      output_tokens: 75,
    });

    const mockClient = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ status: "leased" }] }) };
    vi.mocked(withTransaction).mockImplementation(async (cb) => {
      return cb(mockClient as any);
    });

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      provider: mockProvider,
      maxAttempts: 3,
    });

    // Verify initial run logged as 'repairing' with error_type = 'schema_validation_failed'
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      expect.arrayContaining([
        "sess_1",
        "proj_1",
        "schema_validation_failed",
      ])
    );
    const schemaRepairRunCall = vi.mocked(pool.query).mock.calls.find(c => c[0].includes("INSERT INTO ai_triage_runs") && c[0].includes("'repairing'"));
    expect(schemaRepairRunCall).toBeDefined();
    expect(schemaRepairRunCall![0]).toContain("1, 'validation'");

    // Verify second failure writes 'failed' with attempt_number = 2, failure_stage = 'repair', repair_count = 1
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_triage_runs"),
      expect.arrayContaining([
        "sess_1",
        "proj_1",
        "json_parse_failed",
      ])
    );
    const failRunCall = vi.mocked(pool.query).mock.calls.find(c => c[0].includes("INSERT INTO ai_triage_runs") && c[0].includes("'failed'"));
    expect(failRunCall).toBeDefined();
    expect(failRunCall![0]).toContain("2, 'repair'");

    // Verify job transitioned to failed/dead_letter via handleJobFailure
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE triage_jobs SET"),
      expect.arrayContaining([
        expect.stringContaining("Failed to parse LLM response as JSON"),
      ])
    );
  });
});
