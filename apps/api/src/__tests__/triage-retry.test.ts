/**
 * @file triage-retry.test.ts
 * @description Unit tests verifying retry backoffs and Dead Letter Queue (DLQ) state machine transitions.
 * @why Resolves poison job loops and transient LLM errors. Verifies that failures schedule delayed retries
 *      with appropriate intervals, and terminal jobs transition to the 'dead_letter' queue state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool, withTransaction } from "../db";
import { processTriageJob, getBackoffMs } from "../workers/triage-runner";
import { invokeModel } from "../workers/triage-service";

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

// Mock the LLM provider invocation client.
vi.mock("../workers/triage-service", () => ({
  invokeModel: vi.fn(),
}));

describe("AI Triage Retry & DLQ Mechanics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test Case: verify backoff delay intervals are correctly calculated exponentially.
  it("should calculate backoff delays exponentially", () => {
    expect(getBackoffMs(1)).toBe(60 * 1000); // 1st failed attempt -> 1 min backoff
    expect(getBackoffMs(2)).toBe(300 * 1000); // 2nd failed attempt -> 5 min backoff
    expect(getBackoffMs(3)).toBe(900 * 1000); // 3rd failed attempt -> 15 min backoff
  });

  // Test Case: verify transient errors schedule retry and set next_attempt_at.
  it("should schedule retry with backoff on LLM call failure when attempts < maxAttempts", async () => {
    // Mock session eligibility check to succeed
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "sess_1", url: "http://localhost", duration_ms: 1000, started_at: 100, ended_at: 1100, ai_analyzed_at: null }],
    });
    // Mock timeline events fetch
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    // Mock invokeModel to reject with a transient API timeout error
    vi.mocked(invokeModel).mockRejectedValueOnce(new Error("API Timeout"));

    const mockClient = { query: vi.fn() };
    vi.mocked(withTransaction).mockImplementationOnce(async (cb) => {
      return cb(mockClient as any);
    });

    const mockNow = 1700000000000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(mockNow);

    await processTriageJob("sess_1", "proj_1", 1, {
      workerId: "test-worker",
      model: "claude-3-haiku",
      maxAttempts: 3,
      llmTimeoutMs: 1000,
    });

    // Check that update query was called to schedule retry
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE triage_jobs SET"),
      [
        1700000060000, // nextAttemptAt (1 min backoff)
        "API Timeout",
        1700000000000, // now
        "sess_1",
        "test-worker",
      ]
    );

    // Verify nextAttemptAt has the 1 minute backoff applied correctly
    const updateArgs = mockClient.query.mock.calls.find(c => c[0].includes("UPDATE triage_jobs SET"))?.[1];
    expect(updateArgs).toBeDefined();
    const nextAttemptAt = updateArgs?.[0];
    expect(nextAttemptAt).toBe(1700000060000);

    dateSpy.mockRestore();
  });

  // Test Case: verify job moves to 'dead_letter' when attempts threshold is hit.
  it("should transition job to dead_letter if attempts >= maxAttempts", async () => {
    // Mock session eligibility check to succeed
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ id: "sess_1", url: "http://localhost", duration_ms: 1000, started_at: 100, ended_at: 1100, ai_analyzed_at: null }],
    });
    // Mock timeline events fetch
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    // Mock invokeModel to throw error
    vi.mocked(invokeModel).mockRejectedValueOnce(new Error("Persistent Schema Error"));

    const mockClient = { query: vi.fn() };
    vi.mocked(withTransaction).mockImplementationOnce(async (cb) => {
      return cb(mockClient as any);
    });

    const mockNow = 1700000000000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(mockNow);

    await processTriageJob("sess_1", "proj_1", 3, {
      workerId: "test-worker",
      model: "claude-3-haiku",
      maxAttempts: 3,
      llmTimeoutMs: 1000,
    });

    // Check dead_letter database state transition query args
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE triage_jobs SET"),
      [
        1700000000000, // failed_at
        "Persistent Schema Error",
        "sess_1",
        "test-worker",
      ]
    );

    // Confirm query string sets status to dead_letter
    const deadLetterCall = mockClient.query.mock.calls.find(c => c[0].includes("status = 'dead_letter'"));
    expect(deadLetterCall).toBeDefined();

    dateSpy.mockRestore();
  });
});
