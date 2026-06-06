/**
 * @file candidate-groups.test.ts
 * @description Unit tests verifying database queries, field mapping, and empty filters short-circuit logic for Candidate Retrieval.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "../db";
import { findCandidateIssueGroups } from "../workers/triage/candidate-groups";

vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe("Candidate Issue Group Retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test empty short circuit
  it("should short-circuit and return empty array if fingerprints is empty", async () => {
    const result = await findCandidateIssueGroups("proj_1", []);
    expect(result).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  // Test query arguments and camelCase field mapping
  it("should query issue groups and map snake_case fields to camelCase", async () => {
    const mockGroups = [
      { id: "igr_1", title: "Error 1", fingerprint: "fp1", severity: "P1", status: "open", last_seen_at: "1700000000000" },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockGroups } as any);

    const result = await findCandidateIssueGroups("proj_1", ["fp1"]);
    expect(result).toEqual([
      { 
        id: "igr_1", 
        title: "Error 1", 
        fingerprint: "fp1", 
        severity: "P1", 
        lastSeenAt: 1700000000000,
        root_cause: null,
        suggested_fix: null,
        confidence: null,
        reproduction_steps: null,
      },
    ]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("project_id = $1"),
      ["proj_1", ["fp1"]]
    );
  });

  // Test query CTE frequency ranking
  it("should query using CTE with unnest to rank by frequency, severity, and recency", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    const result = await findCandidateIssueGroups("proj_1", ["fp1", "fp2", "fp1"]);
    expect(result).toEqual([]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WITH session_fps AS"),
      ["proj_1", ["fp1", "fp2", "fp1"]]
    );
  });

  // Test empty db output handling
  it("should return empty array if query returns no rows", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    const result = await findCandidateIssueGroups("proj_1", ["fp1"]);
    expect(result).toEqual([]);
  });

  // Test fingerprint deduplication partitioning
  it("should enforce deduplication by partitioning results per fingerprint", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    await findCandidateIssueGroups("proj_1", ["fp1", "fp2"]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("PARTITION BY ig.fingerprint"),
      ["proj_1", ["fp1", "fp2"]]
    );
  });
});
