/**
 * @file ingest-summary-idempotency.test.ts
 * @description Verifies idempotency controls when ingesting identical session summaries concurrently or sequentially.
 * @why Prevents double-counting or duplicating events if clients retry ingestion payloads.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../app";
import { pool, withTransaction } from "../db";

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
  persistReplayBlob: vi.fn().mockResolvedValue(null),
}));

const makePayload = (summaryEvents: any[]) => {
  return {
    projectKey: "pk_test_123",
    sessionId: "sess_summary_idempotency_1",
    isFinal: false,
    sdkVersion: "1.0.0",
    metadata: {
      url: "http://localhost/page",
      userAgent: "vitest",
      startedAt: Date.now() - 5000,
      screenWidth: 1920,
      screenHeight: 1080,
    },
    summary: summaryEvents,
    events: [],
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

describe("Ingest Summary Idempotency & Hashing", () => {
  const PARAMS_PER_EVENT = 15;
  let fakeClient: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient = { query: vi.fn() };
    (withTransaction as any).mockImplementation(async (cb: any) => {
      await cb(fakeClient);
      return fakeClient;
    });
  });

  it("should generate stable and identical IDs for identical event payloads", async () => {
    const event = {
      type: "js_error",
      timestampMs: 1234567890,
      errorMessage: "TypeError: Cannot read property 'foo' of undefined",
      errorStack: "TypeError: Cannot read property 'foo' of undefined\n  at main.js:10:15",
    };

    // First request
    const res1 = await postIngest(makePayload([event]));
    expect(res1.status).toBe(200);
    const params1 = fakeClient.query.mock.calls[1]![1] as any[];
    const id1 = params1[0] as string; // First field of events_summary is 'id'

    // Second request (retry)
    fakeClient.query.mockClear();
    const res2 = await postIngest(makePayload([event]));
    expect(res2.status).toBe(200);
    const params2 = fakeClient.query.mock.calls[1]![1] as any[];
    const id2 = params2[0] as string;

    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64); // SHA-256 hex string
  });

  it("should prevent hash collisions for different errors occurring at the exact same millisecond", async () => {
    const error1 = {
      type: "js_error",
      timestampMs: 1234567890,
      errorMessage: "Error A",
      errorStack: "Stack A",
    };
    const error2 = {
      type: "js_error",
      timestampMs: 1234567890,
      errorMessage: "Error B",
      errorStack: "Stack B",
    };

    const res = await postIngest(makePayload([error1, error2]));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[1]![1] as any[];
    // Each event contributes exactly PARAMS_PER_EVENT = 14 fields:
    // [0: id, 1: session_id, 2: project_id, 3: type, 4: timestamp_ms, 5: target,
    //  6: error_message, 7: error_stack, 8: network_url, 9: network_status, 10: network_method,
    //  11: click_count, 12: nav_to, 13: created_at]
    expect(params.length).toBe(PARAMS_PER_EVENT * 2);
    const id1 = params[0] as string;
    const id2 = params[PARAMS_PER_EVENT] as string;

    expect(id1).not.toBe(id2);
  });

  it("should prevent hash collisions for different network errors at the same millisecond", async () => {
    const net1 = {
      type: "network_error",
      timestampMs: 1234567890,
      networkUrl: "http://api.com/users",
      networkMethod: "GET",
      networkStatus: 404,
    };
    const net2 = {
      type: "network_error",
      timestampMs: 1234567890,
      networkUrl: "http://api.com/posts",
      networkMethod: "GET",
      networkStatus: 500,
    };

    const res = await postIngest(makePayload([net1, net2]));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[1]![1] as any[];
    expect(params.length).toBe(PARAMS_PER_EVENT * 2);
    const id1 = params[0] as string;
    const id2 = params[PARAMS_PER_EVENT] as string;

    expect(id1).not.toBe(id2);
  });

  it("should prevent hash collisions for different navigation events at the same millisecond", async () => {
    const nav1 = {
      type: "navigation",
      timestampMs: 1234567890,
      navFrom: "/home",
      navTo: "/about",
      navigationType: "pushState",
    };
    const nav2 = {
      type: "navigation",
      timestampMs: 1234567890,
      navFrom: "/home",
      navTo: "/contact",
      navigationType: "pushState",
    };

    const res = await postIngest(makePayload([nav1, nav2]));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[1]![1] as any[];
    expect(params.length).toBe(PARAMS_PER_EVENT * 2);
    const id1 = params[0] as string;
    const id2 = params[PARAMS_PER_EVENT] as string;

    expect(id1).not.toBe(id2);
  });

  it("should truncate extremely long target fields for stable hashing and truncate for DB storage", async () => {
    const longTarget = "a".repeat(12000);
    const click = {
      type: "click",
      timestampMs: 1234567890,
      target: longTarget,
    };

    const res = await postIngest(makePayload([click]));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[1]![1] as any[];
    const savedTarget = params[5] as string;

    // Database limit check
    expect(savedTarget).toHaveLength(10000);
    expect(savedTarget).toBe(longTarget.substring(0, 10000));
  });

  it("should generate the same hash ID for events sharing the same 500-character target prefix", async () => {
    const prefix = "a".repeat(500);
    const click1 = {
      type: "click",
      timestampMs: 1234567890,
      target: prefix + "suffix1",
    };
    const click2 = {
      type: "click",
      timestampMs: 1234567890,
      target: prefix + "suffix2",
    };

    const res = await postIngest(makePayload([click1, click2]));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[1]![1] as any[];
    expect(params.length).toBe(PARAMS_PER_EVENT * 2);
    const id1 = params[0] as string;
    const id2 = params[PARAMS_PER_EVENT] as string;

    expect(id1).toBe(id2);
  });

  it("should handle optional/null values gracefully in hash generation without crashing", async () => {
    const clickEmpty = {
      type: "click",
      timestampMs: 1234567890,
    };

    const res = await postIngest(makePayload([clickEmpty]));
    expect(res.status).toBe(200);

    const params = fakeClient.query.mock.calls[1]![1] as any[];
    const savedTarget = params[5] as string;
    expect(savedTarget).toBe("");
  });
});
