/**
 * @file blob-path-persistence.test.ts
 * @description Tests the asynchronous persistence of session event replays into local blob storage.
 * @why Confirms that event ingestion correctly offloads file compression and updates database columns without blocking requests.
 */

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
  persistReplayBlob: vi.fn(),
}));

const makePayload = (overrides: Record<string, unknown> = {}) => {
  return {
    projectKey: "pk_test_123",
    sessionId: "sess_blob_1",
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

describe("Blob Path Persistence Mechanics", () => {
  let fakeClient: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    fakeClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO sessions")) {
          return {
            rows: [
              {
                duration_ms: null,
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
      }),
    };

    (withTransaction as any).mockImplementation(async (cb: any) => {
      await cb(fakeClient);
      return fakeClient;
    });
  });

  it("should verify successful blob persistence updates session row and path format", async () => {
    // Mock successful blob persistence
    const fakePath = "D:/Coding/Vigil/apps/api/blobs/v1/proj_abc/sess_blob_1/1779881286483_858973_events.json.gz";
    (persistReplayBlob as any).mockResolvedValueOnce({
      path: fakePath,
      compressedBytes: 120,
      serializationMs: 1.5,
      compressionMs: 2.1,
      writeMs: 0.8,
    });

    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    // Fast HTTP response must be completed before replay persistence execution (since it is scheduled via setImmediate)
    expect(persistReplayBlob).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE sessions SET blob_path"), expect.any(Array));

    // Yield to the event loop so setImmediate callback runs
    await new Promise((r) => setImmediate(r));
    // Yield again for the then handlers of the promise to run
    await new Promise((r) => setImmediate(r));

    // Now persistReplayBlob must have been called
    expect(persistReplayBlob).toHaveBeenCalledWith("proj_abc", "sess_blob_1", expect.any(Array));

    // Verify session update call
    const updateCall = (pool.query as any).mock.calls.find((c: any) =>
      c[0].includes("UPDATE sessions") && c[0].includes("blob_path = $1")
    );
    expect(updateCall).toBeDefined();

    const [, params] = updateCall;
    expect(params[0]).toBe("blobs/v1/proj_abc/sess_blob_1/1779881286483_858973_events.json.gz");
    expect(params[2]).toBe("sess_blob_1");
  });

  it("should verify failed blob persistence does not mutate session metadata", async () => {
    // Mock failed blob persistence
    (persistReplayBlob as any).mockRejectedValueOnce(new Error("Disk full"));

    const res = await postIngest(makePayload());
    expect(res.status).toBe(200);

    // Yield to the event loop so setImmediate callback runs
    await new Promise((r) => setImmediate(r));
    // Yield again for the catch handlers of the promise to run
    await new Promise((r) => setImmediate(r));

    // Verify no update sessions query was executed
    const updateCall = (pool.query as any).mock.calls.find((c: any) =>
      c[0].includes("UPDATE sessions") && c[0].includes("blob_path = $1")
    );
    expect(updateCall).toBeUndefined();
  });
});
