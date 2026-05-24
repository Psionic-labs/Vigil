import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../app";
import { pool, withTransaction } from "../db";
import { persistReplayBlob } from "../lib/blob-storage";

vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => {
    const fakeClient = { query: vi.fn() };
    await cb(fakeClient);
    return fakeClient;
  }),
}));

vi.mock("../lib/blob-storage", () => ({
  persistReplayBlob: vi.fn().mockResolvedValue(undefined),
}));

const makePayload = (overrides: Record<string, unknown> = {}) => {
  const startedAt = Date.now() - 5000;
  return {
    projectKey: "pk_test_123",
    sessionId: "sess_lifecycle_1",
    isFinal: false,
    sdkVersion: "1.0.0",
    metadata: {
      url: "http://localhost/page",
      userAgent: "vitest",
      startedAt,
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


describe("Session Upsert Lifecycle", () => {
  let fakeClient: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    // Override withTransaction to capture the fakeClient for inspection
    fakeClient = { query: vi.fn() };
    (withTransaction as any).mockImplementation(async (cb: any) => {
      await cb(fakeClient);
      return fakeClient;
    });
  });

  it("should create session on first ingest with correct initial values", async () => {
    const payload = makePayload();
    const res = await postIngest(payload);
    expect(res.status).toBe(200);

    // Session upsert is the first client.query call
    const upsertCall = fakeClient.query.mock.calls[0]!;
    expect(upsertCall).toBeDefined();

    const sql = upsertCall[0] as string;
    const params = upsertCall[1] as any[];

    // Verify INSERT INTO sessions
    expect(sql).toContain("INSERT INTO sessions");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE SET");

    // Verify key params: sessionId, projectId, startedAt, isFinal=false → ended_at=null
    expect(params[0]).toBe("sess_lifecycle_1"); // id
    expect(params[1]).toBe("proj_abc");          // project_id
    expect(params[10]).toBe(payload.metadata.startedAt);          // started_at
    expect(params[18]).toBeNull();                // ended_at (isFinal=false)
    expect(params[19]).toBeNull();                // duration_ms (isFinal=false)
  });

  it("should set updated_at on every batch", async () => {
    const beforeMs = Date.now();
    const res = await postIngest(makePayload());
    const afterMs = Date.now();
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[0]![1] as any[];
    const createdAt = params[11] as number; // created_at
    const updatedAt = params[12] as number; // updated_at

    // Both should be server timestamps, equal on the same batch
    expect(updatedAt).toBe(createdAt);
    expect(updatedAt).toBeGreaterThanOrEqual(beforeMs);
    expect(updatedAt).toBeLessThanOrEqual(afterMs);
  });

  it("should use GREATEST for ended_at to prevent regression on duplicate finals", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    // The ON CONFLICT clause should use GREATEST, not COALESCE
    expect(sql).toContain("GREATEST(sessions.ended_at, EXCLUDED.ended_at)");
    expect(sql).not.toContain("COALESCE(EXCLUDED.ended_at");
  });

  it("should use GREATEST for duration_ms to prevent regression", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("GREATEST(sessions.duration_ms, EXCLUDED.duration_ms)");
    expect(sql).not.toContain("COALESCE(EXCLUDED.duration_ms");
  });

  it("should set ended_at and compute duration_ms on isFinal=true", async () => {
    const payload = makePayload({ isFinal: true });
    const res = await postIngest(payload);
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[0]![1] as any[];
    const createdAt = params[11] as number;   // server timestamp
    const endedAt = params[18] as number;     // ended_at
    const durationMs = params[19] as number;  // duration_ms

    // ended_at should be set (non-null)
    expect(endedAt).toBe(createdAt);

    // duration_ms = server time - client startedAt
    expect(durationMs).toBe(createdAt - payload.metadata.startedAt);
    expect(durationMs).toBeGreaterThan(0);
  });

  it("should clamp duration_ms to safe integer limits on skew/invalid values", async () => {
    // 1. startedAt is in the future relative to server time
    const resFuture = await postIngest(makePayload({
      isFinal: true,
      metadata: {
        url: "http://localhost/page",
        userAgent: "vitest",
        startedAt: Date.now() + 100000, // 100 seconds in the future
        screenWidth: 1920,
        screenHeight: 1080,
      }
    }));
    expect(resFuture.status).toBe(200);
    const paramsFuture = fakeClient.query.mock.calls[0]![1] as any[];
    expect(paramsFuture[19]).toBe(0); // Clamped to 0

    // Clear calls for next assertion
    fakeClient.query.mockClear();

    // 2. startedAt is extremely old or 0 (overflow case)
    const resOld = await postIngest(makePayload({
      isFinal: true,
      metadata: {
        url: "http://localhost/page",
        userAgent: "vitest",
        startedAt: 1, // extremely old
        screenWidth: 1920,
        screenHeight: 1080,
      }
    }));
    expect(resOld.status).toBe(200);
    const paramsOld = fakeClient.query.mock.calls[0]![1] as any[];
    expect(paramsOld[19]).toBe(2147483647); // Clamped to max signed 32-bit int
  });

  it("should pass null for ended_at and duration_ms on non-final batch", async () => {
    const res = await postIngest(makePayload({ isFinal: false }));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[0]![1] as any[];
    expect(params[18]).toBeNull(); // ended_at
    expect(params[19]).toBeNull(); // duration_ms
  });

  it("should use OR-accumulation for has_* boolean flags", async () => {
    const res = await postIngest(makePayload({
      summary: [
        { type: "js_error", timestampMs: 1000000100, errorMessage: "err" },
        { type: "rage_click", timestampMs: 1000000200, clickCount: 5 },
      ],
    }));
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("sessions.has_js_error OR EXCLUDED.has_js_error");
    expect(sql).toContain("sessions.has_rage_click OR EXCLUDED.has_rage_click");
    expect(sql).toContain("sessions.has_network_err OR EXCLUDED.has_network_err");
    expect(sql).toContain("sessions.has_dead_click OR EXCLUDED.has_dead_click");

    // Verify the flag params are set correctly for this payload
    const params = fakeClient.query.mock.calls[0]![1] as any[];
    expect(params[13]).toBe(true);  // has_js_error
    expect(params[14]).toBe(true);  // has_rage_click
    expect(params[15]).toBe(false); // has_network_err (not in this batch)
    expect(params[16]).toBe(false); // has_dead_click (not in this batch)
    expect(params[17]).toBe(1);     // error_count
  });

  it("should use GREATEST for error_count to stay idempotent across retries", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("GREATEST(sessions.error_count, EXCLUDED.error_count)");
  });

  it("should include updated_at in the ON CONFLICT UPDATE clause", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("updated_at = GREATEST(sessions.updated_at, EXCLUDED.updated_at)");
  });

  it("should run session upsert and summary inserts in the same transaction", async () => {
    const res = await postIngest(makePayload({
      summary: [
        { type: "click", timestampMs: 1000000100, target: "btn" },
      ],
    }));
    expect(res.status).toBe(200);

    // withTransaction should be called exactly once
    expect(withTransaction).toHaveBeenCalledTimes(1);

    // Both session upsert and summary insert should be on the same fakeClient
    expect(fakeClient.query.mock.calls.length).toBe(2);
    expect(fakeClient.query.mock.calls[0]![0]).toContain("INSERT INTO sessions");
    expect(fakeClient.query.mock.calls[1]![0]).toContain("INSERT INTO events_summary");
  });

  it("should not call summary insert when summary array is empty", async () => {
    const res = await postIngest(makePayload({ summary: [] }));
    expect(res.status).toBe(200);

    // Only session upsert, no summary insert
    expect(fakeClient.query.mock.calls.length).toBe(1);
    expect(fakeClient.query.mock.calls[0]![0]).toContain("INSERT INTO sessions");
  });

  it("should not persist blob or commit transaction on transaction failure", async () => {
    (withTransaction as any).mockRejectedValueOnce(new Error("DB exploded"));
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: "proj_abc" }] });

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload()),
    });

    expect(res.status).toBe(500);
    expect(persistReplayBlob).not.toHaveBeenCalled();
  });
});
