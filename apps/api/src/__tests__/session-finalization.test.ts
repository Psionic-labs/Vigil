import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../app";
import { pool, withTransaction } from "../db";

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
    sessionId: "sess_final_1",
    isFinal: true,
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

describe("Session Finalization Correctness", () => {
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
                has_js_error: true,
                has_rage_click: false,
                has_network_err: false,
                has_dead_click: false,
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

  it("should verify finalized sessions persist ended_at", async () => {
    const res = await postIngest(makePayload({ isFinal: true }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO sessions")
    )!;
    expect(upsertCall).toBeDefined();
    
    // Check parameters bound: endedAt ($18) should be non-null and durationMs ($19) is 0
    const params = upsertCall[1] as any[];
    expect(params[17]).not.toBeNull(); // endedAt (18th param, 0-indexed index 17)
    expect(params[18]).toBe(0);        // durationMs (19th param, 0-indexed index 18)
  });

  it("should verify finalized sessions compute duration_ms using PostgreSQL delta logic", async () => {
    const res = await postIngest(makePayload({ isFinal: true }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO sessions")
    )!;
    const sql = upsertCall[0] as string;

    // Check duration calculation logic
    expect(sql).toContain("duration_ms = CASE");
    expect(sql).toContain("EXCLUDED.ended_at - sessions.created_at, 0");
    expect(sql).toContain("LEAST(");
  });

  it("should verify duplicate final flushes preserve largest duration", async () => {
    const res = await postIngest(makePayload({ isFinal: true }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO sessions")
    )!;
    const sql = upsertCall[0] as string;

    // GREATEST preserves largest duration monotonically
    expect(sql).toContain("COALESCE(sessions.duration_ms, 0)");
    expect(sql).toContain("GREATEST(");
  });

  it("should verify non-final retries never wipe finalized durations", async () => {
    const res = await postIngest(makePayload({ isFinal: false }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO sessions")
    )!;
    const sql = upsertCall[0] as string;
    const params = upsertCall[1] as any[];

    // Ensure non-final payloads bind null for ended_at and duration_ms
    expect(params[17]).toBeNull();
    expect(params[18]).toBeNull();

    // Verify the CASE expression falls back to sessions.duration_ms and sessions.ended_at
    expect(sql).toContain("ended_at = CASE");
    expect(sql).toContain("ELSE sessions.ended_at");
    expect(sql).toContain("duration_ms = CASE");
    expect(sql).toContain("ELSE sessions.duration_ms");
  });
});
