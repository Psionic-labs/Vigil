/**
 * @file triage-crash-recovery.test.ts
 * @description Unit tests verifying worker crash recovery and stale lease reclamation capabilities.
 * @why If a worker process crashes or restarts, its active leased jobs must not remain locked forever.
 *      Checking that other workers can claim jobs whose lock duration exceeds leaseTimeoutMs guarantees self-healing queue recovery.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { withTransaction } from "../db";
import { pollCycle } from "../workers/triage-worker";
import { processTriageJob } from "../workers/triage-runner";

// Mock the database client to intercept the query values and states.
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

// Mock the triage runner execution module to verify mock process routing.
vi.mock("../workers/triage-runner", () => ({
  processTriageJob: vi.fn().mockResolvedValue(undefined),
}));

describe("AI Triage Worker Crash Recovery & Lease Expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test Case: verify that stale leased jobs are successfully selected and passed to the runner.
  it("should select and reclaim stale leased jobs whose locked_at is older than the lease timeout", async () => {
    const mockStaleJobs = [
      { session_id: "stale_sess_123", project_id: "proj_1", attempts: 1 },
    ];

    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: mockStaleJobs }),
    };

    vi.mocked(withTransaction).mockImplementationOnce(async (cb) => {
      return cb(mockClient as any);
    });
    await pollCycle();

    // Verify the claim query incorporates the stale lease expiration check (locked_at < staleThreshold)
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'leased' AND locked_at < $3"),
      expect.any(Array)
    );

    // Verify the inputs passed to the claiming query
    const claimArgs = mockClient.query.mock.calls[0]?.[1];
    expect(claimArgs).toBeDefined();

    // claimArgs structure: [maxAttempts, now, now - leaseTimeoutMs, batchSize, workerId]
    const attemptsLimit = claimArgs?.[0];
    const currentTime = claimArgs?.[1];
    const staleThreshold = claimArgs?.[2];

    expect(attemptsLimit).toBe(3); // TRIAGE_MAX_ATTEMPTS default
    expect(currentTime).toBeGreaterThan(0);
    // Lease timeout is default 300,000ms (5 minutes)
    expect(staleThreshold).toBe(currentTime - 300000);

    // Verify that the stale job was passed to processTriageJob for processing
    expect(processTriageJob).toHaveBeenCalledTimes(1);
    expect(processTriageJob).toHaveBeenCalledWith("stale_sess_123", "proj_1", 1, expect.any(Object));
  });
});
