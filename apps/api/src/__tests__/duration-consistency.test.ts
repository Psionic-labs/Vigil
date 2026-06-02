import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../app";
import { pool, withTransaction } from "../db";
import { reconcileAbandonedSessions } from "../lib/reconciliation";

// Mock database connection
vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(),
}));

vi.mock("../lib/blob-storage", () => ({
  persistReplayBlob: vi.fn().mockResolvedValue(undefined),
}));

const makePayload = (overrides: Record<string, unknown> = {}) => {
  return {
    projectKey: "pk_test_123",
    sessionId: "sess_dur_1",
    isFinal: false,
    sdkVersion: "1.0.0",
    metadata: {
      url: "http://localhost/page",
      userAgent: "vitest",
      startedAt: Date.now() - 10000,
      screenWidth: 1920,
      screenHeight: 1080,
    },
    summary: [],
    events: [{ type: 1, data: {} }],
    ...overrides,
  };
};

const postIngest = async (payload: Record<string, unknown>) => {
  (pool.query as any).mockResolvedValueOnce({ rows: [{ id: "proj_abc" }] });
  return app.request("/api/v1/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

describe("Duration Consistency", () => {
  let fakeClient: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    fakeClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO sessions")) {
          return {
            rows: [
              {
                duration_ms: 10000,
                has_js_error: false,
                has_rage_click: false,
                has_network_err: false,
                has_dead_click: false,
                is_abandoned: false,
                abandoned_at: null,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    (withTransaction as any).mockImplementation(async (cb: any) => {
      await cb(fakeClient);
      return fakeClient;
    });
  });

  describe("Finalized sessions use authoritative ended_at for duration", () => {
    it("should compute duration_ms using EXCLUDED.ended_at - sessions.created_at on final payload", async () => {
      const payload = makePayload({ isFinal: true });
      const res = await postIngest(payload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      expect(upsertCall).toBeDefined();
      const sql = upsertCall[0] as string;

      // Verify the CASE expression uses EXCLUDED.ended_at (authoritative finalization timestamp)
      expect(sql).toContain("duration_ms = CASE");
      expect(sql).toContain("WHEN EXCLUDED.ended_at IS NOT NULL THEN");
      expect(sql).toContain("GREATEST(EXCLUDED.ended_at - sessions.created_at, 0)");

      // Verify monotonic-safety: COALESCE to prevent regression
      expect(sql).toContain("COALESCE(sessions.duration_ms, 0)");
    });

    it("should NOT use last_ingest_at for finalized session duration", async () => {
      const payload = makePayload({ isFinal: true });
      const res = await postIngest(payload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      const sql = upsertCall[0] as string;

      // The duration CASE expression for EXCLUDED.ended_at IS NOT NULL branch
      // must NOT use last_ingest_at — it uses EXCLUDED.ended_at - sessions.created_at
      const durationCaseBlock = sql.substring(
        sql.indexOf("duration_ms = CASE"),
        sql.indexOf("is_abandoned = CASE")
      );

      // The finalization branch uses ended_at, not last_ingest_at
      expect(durationCaseBlock).toContain("EXCLUDED.ended_at - sessions.created_at");
      expect(durationCaseBlock).not.toContain("last_ingest_at - started_at");
    });
  });

  describe("Unfinalized sessions use last_ingest_at fallback", () => {
    it("should preserve existing duration_ms for non-final payloads (ELSE branch)", async () => {
      const payload = makePayload({ isFinal: false });
      const res = await postIngest(payload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      const sql = upsertCall[0] as string;

      // Non-final payloads set ended_at to NULL, so EXCLUDED.ended_at IS NOT NULL is false.
      // The ELSE branch preserves sessions.duration_ms
      expect(sql).toContain("ELSE sessions.duration_ms");

      // Verify ended_at parameter is null for non-final
      const params = upsertCall[1] as any[];
      expect(params[17]).toBeNull(); // ended_at
      expect(params[18]).toBeNull(); // duration_ms
    });
  });

  describe("Abandoned sessions compute duration correctly via reconciliation", () => {
    it("should compute abandoned session duration from last_ingest_at - started_at", async () => {
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{ count: 1, oldest_last_ingest_at: "1700000000000" }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
        });

      const result = await reconcileAbandonedSessions(900000, 1700001000000);

      expect(result.reconciled).toBe(1);

      // Verify the reconciliation UPDATE uses last_ingest_at - started_at
      const updateCall = (pool.query as any).mock.calls[1];
      const sql = updateCall[0] as string;

      expect(sql).toContain("GREATEST(last_ingest_at - started_at, 0)");
      // Also verify monotonic safety
      expect(sql).toContain("COALESCE(duration_ms, 0)");
    });
  });

  describe("Duration clamp semantics", () => {
    it("should clamp negative durations to 0 via GREATEST", async () => {
      const payload = makePayload({ isFinal: true });
      const res = await postIngest(payload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      const sql = upsertCall[0] as string;

      // GREATEST(..., 0) prevents negative durations
      expect(sql).toContain("GREATEST(EXCLUDED.ended_at - sessions.created_at, 0)");
    });

    it("should cap duration_ms at INT32 max via LEAST", async () => {
      const payload = makePayload({ isFinal: true });
      const res = await postIngest(payload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      const sql = upsertCall[0] as string;

      // LEAST(..., 2147483647) caps at INT32 max
      expect(sql).toContain("2147483647");
      expect(sql).toContain("LEAST(");
    });
  });

  describe("Duplicate final flushes preserve monotonic duration", () => {
    it("should use GREATEST with COALESCE to never regress duration_ms", async () => {
      // First final flush
      const payload1 = makePayload({ isFinal: true });
      await postIngest(payload1);

      // Second final flush (duplicate)
      const payload2 = makePayload({ isFinal: true, sessionId: "sess_dur_1" });
      await postIngest(payload2);

      // Both flushes should use the same monotonic-safe SQL
      for (const call of fakeClient.query.mock.calls) {
        const sql = call[0] as string;
        if (sql.includes("INSERT INTO sessions")) {
          // GREATEST(COALESCE(sessions.duration_ms, 0), ...) ensures monotonicity
          expect(sql).toContain("COALESCE(sessions.duration_ms, 0)");
          expect(sql).toContain("GREATEST(");
        }
      }
    });
  });

  describe("Late replay packets do not inflate finalized durations", () => {
    it("should not update duration_ms when late non-final batch arrives for finalized session", async () => {
      // Late non-final batch (replay data arriving after session finalized)
      const latePayload = makePayload({ isFinal: false });
      const res = await postIngest(latePayload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      const sql = upsertCall[0] as string;
      const params = upsertCall[1] as any[];

      // Non-final payload sends ended_at = null, so EXCLUDED.ended_at IS NOT NULL is false
      // The ELSE branch preserves sessions.duration_ms (unchanged)
      expect(params[17]).toBeNull(); // ended_at
      expect(sql).toContain("ELSE sessions.duration_ms");

      // last_ingest_at may advance (monotonically) but does NOT affect duration_ms
      expect(sql).toContain("last_ingest_at = GREATEST(sessions.last_ingest_at, EXCLUDED.last_ingest_at)");
    });
  });
});
