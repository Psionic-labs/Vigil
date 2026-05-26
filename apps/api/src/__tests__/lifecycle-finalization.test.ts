import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../app";
import { pool, withTransaction } from "../db";
import { persistReplayBlob } from "../lib/blob-storage";

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

describe("Final Session Lifecycle & AI Triage Enqueue", () => {
  let fakeClient: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    fakeClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT duration_ms")) {
          // Default mock session state that is not skipped (long duration, has error)
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

  it("should set ended_at and duration_ms on final payload", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const upsertCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO sessions")
    )!;
    expect(upsertCall).toBeDefined();
    const sql = upsertCall[0] as string;
    expect(sql).toContain("ended_at = GREATEST(sessions.ended_at, EXCLUDED.ended_at)");
    expect(sql).toContain("duration_ms = GREATEST");
    expect(sql).toContain("EXCLUDED.ended_at - sessions.created_at, 0");
  });

  it("should skip sessions with duration under 5 seconds", async () => {
    // Override SELECT sessions to return a short duration session state
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT duration_ms")) {
        return {
          rows: [
            {
              duration_ms: 3000, // < 5000ms
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
    });

    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    // Should update sessions table to skip
    const updateCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("ai_analysis_skipped = true")
    )!;
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe("duration_under_5s");

    // Should NOT enqueue triage job
    const jobCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO triage_jobs")
    );
    expect(jobCall).toBeUndefined();
  });

  it("should skip sessions with no user friction signals", async () => {
    // Override SELECT sessions to return a session with no error/rage/dead/network flags
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT duration_ms")) {
        return {
          rows: [
            {
              duration_ms: 10000,
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

    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    // Should update sessions table to skip
    const updateCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("ai_analysis_skipped = true")
    )!;
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe("no_friction_signals");

    // Should NOT enqueue triage job
    const jobCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO triage_jobs")
    );
    expect(jobCall).toBeUndefined();
  });

  it("should enqueue triage job for meaningful finalized session", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    // Should reset skip status to false
    const updateCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("ai_analysis_skipped = false")
    )!;
    expect(updateCall).toBeDefined();

    // Should insert into triage_jobs table
    const jobCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO triage_jobs")
    )!;
    expect(jobCall).toBeDefined();
    expect(jobCall[1][0]).toBe("sess_final_1"); // sessionId
    expect(jobCall[1][1]).toBe("proj_abc");      // projectId
  });

  it("should idempotent-enqueue triage jobs using ON CONFLICT DO NOTHING", async () => {
    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    const jobCall = fakeClient.query.mock.calls.find((c) =>
      c[0].includes("INSERT INTO triage_jobs")
    )!;
    expect(jobCall).toBeDefined();
    const sql = jobCall[0] as string;
    expect(sql).toContain("ON CONFLICT (session_id) DO NOTHING");
  });

  it("should skip replay persistence scheduling if the database transaction fails", async () => {
    (withTransaction as any).mockRejectedValueOnce(new Error("DB Connection Error"));

    const res = await postIngest(makePayload());
    expect(res.status).toBe(500);

    // Replay persistence is only scheduled after a successful commit; it never executes on failure
    expect(persistReplayBlob).not.toHaveBeenCalled();
  });
});
