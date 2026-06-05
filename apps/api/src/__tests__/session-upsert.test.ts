/**
 * @file session-upsert.test.ts
 * @description Tests session table upsert query pathways under high concurrency or conflicting inputs.
 * @why Prevents deadlocks, duplicate keys, and metadata corruption during raw SQL session writes.
 */

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
    fakeClient = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (sql.includes("INSERT INTO events_summary")) {
          const rows: { type: string }[] = [];
          if (params) {
            for (let i = 3; i < params.length; i += 15) {
              rows.push({ type: params[i] });
            }
          }
          return { rows, rowCount: rows.length };
        }
        if (sql.includes("INSERT INTO sessions")) {
          return {
            rows: [
              {
                duration_ms: 0,
                has_js_error: false,
                has_rage_click: false,
                has_network_err: false,
                has_dead_click: false,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      })
    };
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
    expect(params[17]).toBeNull();                // ended_at (isFinal=false)
    expect(params[18]).toBeNull();                // duration_ms (isFinal=false)
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

  it("should use CASE and GREATEST for ended_at to prevent regression on duplicate finals", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("ended_at = CASE");
    expect(sql).toContain("GREATEST(sessions.ended_at, EXCLUDED.ended_at)");
  });

  it("should use LEAST and GREATEST for duration_ms to prevent regression and negative values", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("LEAST(");
    expect(sql).toContain("GREATEST(");
    expect(sql).toContain("sessions.duration_ms");
    expect(sql).toContain("EXCLUDED.ended_at - sessions.created_at");
  });

  it("should set ended_at and pass initial duration parameter on isFinal=true", async () => {
    const payload = makePayload({ isFinal: true });
    const res = await postIngest(payload);
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[0]![1] as any[];
    const createdAt = params[11] as number;   // server timestamp
    const endedAt = params[17] as number;     // ended_at
    const durationMs = params[18] as number;  // initial duration_ms parameter

    // ended_at should be set (non-null)
    expect(endedAt).toBe(createdAt);

    // durationMs parameter is passed as 0 (delegating actual duration to the DB calculation)
    expect(durationMs).toBe(0);
  });

  it("should pass null for ended_at and duration_ms on non-final batch", async () => {
    const res = await postIngest(makePayload({ isFinal: false }));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[0]![1] as any[];
    expect(params[17]).toBeNull(); // ended_at
    expect(params[18]).toBeNull(); // duration_ms
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

    // Assert on query semantics: Step 3 UPDATE should be called to increment error_count by 1
    const updateCall = fakeClient.query.mock.calls.find(c => c[0].includes("UPDATE sessions SET"))!;
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe(1); // newErrors = 1
  });

  it("should preserve sessions.error_count on metadata upsert conflict to remain idempotent", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const sql = fakeClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("error_count = sessions.error_count");
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

  it("should set has_js_error to true and update error_count for js_error and console_error", async () => {
    const res = await postIngest(makePayload({
      summary: [
        { type: "js_error", timestampMs: 1000000100, errorMessage: "js err" },
        { type: "console_error", timestampMs: 1000000200, message: "console err" },
      ]
    }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find(c => c[0].includes("INSERT INTO sessions"))!;
    expect(upsertCall).toBeDefined();
    const upsertParams = upsertCall[1] as any[];
    expect(upsertParams[13]).toBe(true);  // has_js_error
    expect(upsertParams[14]).toBe(false); // has_rage_click
    expect(upsertParams[15]).toBe(false); // has_network_err
    expect(upsertParams[16]).toBe(false); // has_dead_click

    const updateCall = fakeClient.query.mock.calls.find(c => c[0].includes("UPDATE sessions SET"))!;
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe(2); // newErrors = 2
  });

  it("should set has_rage_click to true for rage_click events", async () => {
    const res = await postIngest(makePayload({
      summary: [
        { type: "rage_click", timestampMs: 1000000100, clickCount: 4 }
      ]
    }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find(c => c[0].includes("INSERT INTO sessions"))!;
    expect(upsertCall).toBeDefined();
    const upsertParams = upsertCall[1] as any[];
    expect(upsertParams[13]).toBe(false); // has_js_error
    expect(upsertParams[14]).toBe(true);  // has_rage_click
    expect(upsertParams[15]).toBe(false); // has_network_err
    expect(upsertParams[16]).toBe(false); // has_dead_click
  });

  it("should set has_network_err to true for network_error events", async () => {
    const res = await postIngest(makePayload({
      summary: [
        { type: "network_error", timestampMs: 1000000100, networkUrl: "http://api.com", networkStatus: 500, networkMethod: "GET" }
      ]
    }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find(c => c[0].includes("INSERT INTO sessions"))!;
    expect(upsertCall).toBeDefined();
    const upsertParams = upsertCall[1] as any[];
    expect(upsertParams[13]).toBe(false); // has_js_error
    expect(upsertParams[14]).toBe(false); // has_rage_click
    expect(upsertParams[15]).toBe(true);  // has_network_err
    expect(upsertParams[16]).toBe(false); // has_dead_click
  });

  it("should set has_dead_click to true for dead_click events", async () => {
    const res = await postIngest(makePayload({
      summary: [
        { type: "dead_click", timestampMs: 1000000100 }
      ]
    }));
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find(c => c[0].includes("INSERT INTO sessions"))!;
    expect(upsertCall).toBeDefined();
    const upsertParams = upsertCall[1] as any[];
    expect(upsertParams[13]).toBe(false); // has_js_error
    expect(upsertParams[14]).toBe(false); // has_rage_click
    expect(upsertParams[15]).toBe(false); // has_network_err
    expect(upsertParams[16]).toBe(true);  // has_dead_click
  });

  it("should be idempotent under duplicate retries and skip Step 3 update", async () => {
    fakeClient.query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO events_summary")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO sessions")) {
        return {
          rows: [
            {
              duration_ms: 0,
              has_js_error: false,
              has_rage_click: false,
              has_network_err: false,
              has_dead_click: false,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await postIngest(makePayload({
      summary: [
        { type: "js_error", timestampMs: 1000000100, errorMessage: "js err" }
      ]
    }));
    expect(res.status).toBe(200);

    const updateCall = fakeClient.query.mock.calls.find(c => c[0].includes("UPDATE sessions SET"));
    expect(updateCall).toBeUndefined();
  });

  it("should only increment error_count for newly inserted rows in a mixed batch", async () => {
    fakeClient.query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO events_summary")) {
        return { rows: [{ type: "console_error" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO sessions")) {
        return {
          rows: [
            {
              duration_ms: 0,
              has_js_error: false,
              has_rage_click: false,
              has_network_err: false,
              has_dead_click: false,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await postIngest(makePayload({
      summary: [
        { type: "js_error", timestampMs: 1000000100, errorMessage: "js err" }, // duplicate (skipped)
        { type: "console_error", timestampMs: 1000000200, message: "new error" } // new (inserted)
      ]
    }));
    expect(res.status).toBe(200);

    const updateCall = fakeClient.query.mock.calls.find(c => c[0].includes("UPDATE sessions SET"))!;
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe(1); // newErrors = 1
  });

  it("should ensure aggregate flags never regress and final flushes preserve session state", async () => {
    const payload1 = makePayload({
      isFinal: false,
      summary: [
        { type: "js_error", timestampMs: 1000000100, errorMessage: "err" }
      ]
    });
    const res1 = await postIngest(payload1);
    expect(res1.status).toBe(200);

    let upsertCall = fakeClient.query.mock.calls[0]!;
    expect(upsertCall[1][13]).toBe(true); // has_js_error
    expect(upsertCall[1][17]).toBeNull(); // ended_at

    fakeClient.query.mockClear();

    const payload2 = makePayload({
      isFinal: true,
      summary: []
    });
    const res2 = await postIngest(payload2);
    expect(res2.status).toBe(200);

    upsertCall = fakeClient.query.mock.calls[0]!;
    expect(upsertCall[1][13]).toBe(false); // has_js_error parameter in this payload is false
    expect(upsertCall[1][17]).not.toBeNull(); // ended_at parameter is set
    
    const sql = upsertCall[0] as string;
    expect(sql).toContain("has_js_error = sessions.has_js_error OR EXCLUDED.has_js_error");
    expect(sql).toContain("ended_at = CASE");
  });

  it("should ensure non-final retries never wipe finalized durations by passing null ended_at", async () => {
    const payload = makePayload({ isFinal: false });
    const res = await postIngest(payload);
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls[0]!;
    const sql = upsertCall[0] as string;
    const params = upsertCall[1] as any[];

    // Ensure ended_at and duration_ms params are null (so EXCLUDED.ended_at is null)
    expect(params[17]).toBeNull(); // ended_at parameter
    expect(params[18]).toBeNull(); // duration_ms parameter

    // Ensure the SQL contains the CASE expression to fall back to sessions.duration_ms
    expect(sql).toContain("duration_ms = CASE");
    expect(sql).toContain("ELSE sessions.duration_ms");
  });

  it("should ensure duplicate final flushes preserve duration by using GREATEST with COALESCE", async () => {
    const payload = makePayload({ isFinal: true });
    const res = await postIngest(payload);
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls[0]!;
    const sql = upsertCall[0] as string;

    // Ensure SQL uses GREATEST with COALESCE on duration_ms and new computed duration
    expect(sql).toContain("COALESCE(sessions.duration_ms, 0)");
    expect(sql).toContain("duration_ms = CASE");
  });

  it("should ensure duration remains monotonic under retries", async () => {
    const payload = makePayload({ isFinal: true });
    const res = await postIngest(payload);
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls[0]!;
    const sql = upsertCall[0] as string;

    // Ensure SQL monotonically compares previous duration and new duration
    expect(sql).toContain("COALESCE(sessions.duration_ms, 0)");
    expect(sql).toContain("EXCLUDED.ended_at - sessions.created_at");
  });
});
