import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import app from "../app";
import { pool, withTransaction } from "../db";
import {
  reconcileAbandonedSessions,
  startReconciliationWorker,
  stopReconciliationWorker,
} from "../lib/reconciliation";

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
    sessionId: "sess_recon_1",
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

describe("Session Timeout Reconciliation", () => {
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

  afterEach(() => {
    stopReconciliationWorker();
  });

  describe("Reconciliation Logic Tests", () => {
    it("should update unfinalized stale sessions to abandoned and calculate monotonic duration", async () => {
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{ count: 2, oldest_last_ingest_at: "1700000000000" }],
        })
        .mockResolvedValueOnce({
          rowCount: 2,
        });

      const nowMs = 1700000900000;
      const timeoutMs = 900000; // 15 mins

      const result = await reconcileAbandonedSessions(timeoutMs, nowMs);

      expect(result.scanned).toBe(2);
      expect(result.reconciled).toBe(2);
      expect(result.oldestUnreconciledAgeMs).toBe(nowMs - 1700000000000);

      // Verify the SELECT query is optimized using partial index columns
      const selectSql = (pool.query as any).mock.calls[0][0];
      expect(selectSql).toContain("WHERE ended_at IS NULL");
      expect(selectSql).toContain("is_abandoned = false");

      // Verify the UPDATE query
      const updateCall = (pool.query as any).mock.calls[1];
      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toContain("UPDATE sessions");
      expect(updateCall[0]).toContain("is_abandoned = true");
      expect(updateCall[0]).toContain("RETURNING 1"); // Optimized count instead of returning full record or IDs
      expect(updateCall[1][0]).toBe(nowMs);
      expect(updateCall[1][1]).toBe(timeoutMs);
    });

    it("should bound session timeoutMs to a minimum of 10 seconds", async () => {
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{ count: 0, oldest_last_ingest_at: null }],
        })
        .mockResolvedValueOnce({
          rowCount: 0,
        });

      await reconcileAbandonedSessions(5000); // 5 seconds (below min limit)

      const updateCall = (pool.query as any).mock.calls[1];
      expect(updateCall[1][1]).toBe(10000); // Clamped to 10 seconds minimum
    });

    it("should replace non-finite session timeouts with the minimum safe timeout", async () => {
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{ count: 0, oldest_last_ingest_at: null }],
        })
        .mockResolvedValueOnce({
          rowCount: 0,
        });

      await reconcileAbandonedSessions(Number.NaN);

      const updateCall = (pool.query as any).mock.calls[1];
      expect(updateCall[1][1]).toBe(10000);
    });

    it("should verify duplicate reconciliation runs are idempotent and ignore already abandoned sessions", async () => {
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{ count: 0, oldest_last_ingest_at: null }],
        })
        .mockResolvedValueOnce({
          rowCount: 0,
        });

      const result = await reconcileAbandonedSessions(900000);

      expect(result.scanned).toBe(0);
      expect(result.reconciled).toBe(0);

      const updateCall = (pool.query as any).mock.calls[1];
      expect(updateCall[0]).toContain("AND is_abandoned = false");
    });
  });

  describe("Reconciliation Worker Lifecycle Tests", () => {
    it("should start and stop the worker safely and handle duplicate starts", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.useFakeTimers();

      startReconciliationWorker(60000, 900000);
      
      // Attempt duplicate worker start
      startReconciliationWorker(60000, 900000);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Worker is already running"));

      // Advance by jitter (up to 5s) to trigger first execution
      vi.advanceTimersByTime(5000);

      stopReconciliationWorker();
      vi.useRealTimers();

      consoleWarnSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it("should schedule a safe interval when worker inputs are invalid", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      vi.useFakeTimers();
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{ count: 0, oldest_last_ingest_at: null }],
        })
        .mockResolvedValueOnce({ rowCount: 0 });

      startReconciliationWorker(Number.NaN, Number.NaN);
      vi.advanceTimersByTime(0);

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10000);

      stopReconciliationWorker();
      vi.useRealTimers();
      setIntervalSpy.mockRestore();
      randomSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe("Ingest Pipeline State Transition Tests", () => {
    it("should ensure late non-final retries update last_ingest_at monotonically but do not clear is_abandoned", async () => {
      const payload = makePayload({ isFinal: false });
      const res = await postIngest(payload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      expect(upsertCall).toBeDefined();
      const sql = upsertCall[0] as string;

      // Verify that is_abandoned and abandoned_at are preserved on non-final upsert conflicts
      expect(sql).toContain("is_abandoned = CASE");
      expect(sql).toContain("ELSE sessions.is_abandoned");
      expect(sql).toContain("abandoned_at = CASE");
      expect(sql).toContain("ELSE sessions.abandoned_at");
      expect(sql).toContain("last_ingest_at = GREATEST(sessions.last_ingest_at, EXCLUDED.last_ingest_at)");
    });

    it("should ensure late final flushes successfully clear is_abandoned and abandoned_at (supersede abandonment)", async () => {
      const payload = makePayload({ isFinal: true });
      const res = await postIngest(payload);
      expect(res.status).toBe(200);

      const upsertCall = fakeClient.query.mock.calls.find((c) =>
        c[0].includes("INSERT INTO sessions")
      )!;
      expect(upsertCall).toBeDefined();
      const sql = upsertCall[0] as string;

      // Verify that is_abandoned and abandoned_at are cleared to false/NULL on final flushes
      expect(sql).toContain("is_abandoned = CASE");
      expect(sql).toContain("WHEN EXCLUDED.ended_at IS NOT NULL THEN false");
      expect(sql).toContain("abandoned_at = CASE");
      expect(sql).toContain("WHEN EXCLUDED.ended_at IS NOT NULL THEN NULL");
    });
  });
});
