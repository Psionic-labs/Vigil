/**
 * @file triage-concurrency.test.ts
 * @description Concurrency and lock contention safety unit tests for the AI Triage Worker.
 * @why Verifying that the worker claiming query includes row locking (FOR UPDATE) and bypasses locked rows (SKIP LOCKED)
 *      guarantees multiple replicas can scale horizontally without resource deadlocks or duplicate processing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { withTransaction } from "../db";
import { pollCycle } from "../workers/triage-worker";

// Mock the database pool to isolate polling query execution tests.
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

describe("AI Triage Concurrency & Skip Locked Safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test Case: verify claim query syntax includes row-level locking parameters.
  it("should enforce FOR UPDATE SKIP LOCKED on claiming query to avoid contention", async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
    };

    vi.mocked(withTransaction).mockImplementationOnce(async (cb) => {
      return cb(mockClient as any);
    });

    await pollCycle();

    // Verify claim query incorporates FOR UPDATE SKIP LOCKED
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE SKIP LOCKED"),
      expect.any(Array)
    );

    // Verify batch limit (parameter 4) exists to cap memory size bounds
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT $4"),
      expect.any(Array)
    );
  });
});
