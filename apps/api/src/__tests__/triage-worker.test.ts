/**
 * @file triage-worker.test.ts
 * @description Unit tests verifying the master loop configuration checks, claiming cycles, and runner delegation.
 * @why Ensures that loop configurations fail-fast on bad timeouts, and the polling query claims
 *      eligible jobs and invokes processTriageJob for each concurrently.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { withTransaction } from "../db";
import { pollCycle, validateTimeoutBounds } from "../workers/triage-worker";

// Mock the database transaction interface
vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => {
    const client = { query: vi.fn() };
    return cb(client as any);
  }),
}));

// Mock the triage runner execution module to avoid real API calls and isolate loop cycles
vi.mock("../workers/triage-runner", () => ({
  processTriageJob: vi.fn().mockResolvedValue(undefined),
}));

import { processTriageJob } from "../workers/triage-runner";

describe("AI Triage Worker Loop & Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test Case 1: Timeout Bounds Check
  // Verifies that process boot fails-fast if TRIAGE_LEASE_TIMEOUT_MS is configured
  // to be less than or equal to TRIAGE_LLM_TIMEOUT_MS, protecting against early lease expiration.
  it("should enforce lease timeout validation on startup", () => {
    expect(() => {
      validateTimeoutBounds(1000, 2000);
    }).toThrow("TRIAGE_LEASE_TIMEOUT_MS must be greater than TRIAGE_LLM_TIMEOUT_MS");

    expect(() => {
      validateTimeoutBounds(2000, 1000);
    }).not.toThrow();
  });

  // Test Case 2: Claiming and Delegation
  // Verifies that when jobs are returned from the DB claim query,
  // they are correctly locked and delegated to the processTriageJob runner concurrently.
  it("should claim pending jobs and delegate them to triage runner", async () => {
    const mockJobs = [
      { session_id: "sess_1", project_id: "proj_1", attempts: 0 },
      { session_id: "sess_2", project_id: "proj_1", attempts: 1 },
    ];

    // Mock claim query transaction result
    vi.mocked(withTransaction).mockImplementationOnce(async (cb) => {
      const client = {
        query: vi.fn().mockResolvedValueOnce({ rows: mockJobs }),
      };
      return cb(client as any);
    });

    await pollCycle();

    // Verify runner was invoked for all returned jobs
    expect(processTriageJob).toHaveBeenCalledTimes(2);
    expect(processTriageJob).toHaveBeenCalledWith("sess_1", "proj_1", 0, expect.any(Object));
    expect(processTriageJob).toHaveBeenCalledWith("sess_2", "proj_1", 1, expect.any(Object));
  });

  // Test Case 3: Empty Queue Cycles
  // Verifies that if no pending/failed jobs are available, the worker loop skips runner executions.
  it("should handle empty queue cycles without invoking the runner", async () => {
    vi.mocked(withTransaction).mockImplementationOnce(async (cb) => {
      const client = {
        query: vi.fn().mockResolvedValueOnce({ rows: [] }),
      };
      return cb(client as any);
    });

    await pollCycle();

    expect(processTriageJob).not.toHaveBeenCalled();
  });
});
