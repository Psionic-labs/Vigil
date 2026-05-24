import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../app";
import { pool, withTransaction } from "../db";
import { persistReplayBlob } from "../lib/blob-storage";

// Mock the DB and Blob Storage to avoid hitting external services during tests
vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => {
    // Provide a fake client that tracks queries
    const fakeClient = { query: vi.fn() };
    await cb(fakeClient);
    return fakeClient;
  }),
}));

vi.mock("../lib/blob-storage", () => ({
  persistReplayBlob: vi.fn(),
}));

const VALID_PAYLOAD = {
  projectKey: "pk_test_123",
  sessionId: "sess_abc",
  isFinal: false,
  sdkVersion: "1.0.0",
  metadata: {
    url: "http://localhost",
    userAgent: "vitest",
    startedAt: 1234567890,
    screenWidth: 1024,
    screenHeight: 768,
  },
  summary: [
    {
      type: "click",
      timestampMs: 1234567900,
      target: "button#submit",
    },
  ],
  events: [{ type: 1, data: {} }, { type: 2, data: {} }],
};

describe("Ingest API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should accept valid payload and perform DB/Blob writes", async () => {
    // Mock project lookup to succeed
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: "proj_123" }] });

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify DB was checked
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT id FROM projects WHERE public_key = $1",
      ["pk_test_123"]
    );

    // Verify transaction was used
    expect(withTransaction).toHaveBeenCalled();
    
    // Verify Blob persistence was called
    expect(persistReplayBlob).toHaveBeenCalledWith(
      "proj_123",
      "sess_abc",
      VALID_PAYLOAD.events
    );
  });

  it("should return 401 for invalid project key", async () => {
    // Mock project lookup to fail
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should reject malformed payload with 400 Zod Error", async () => {
    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_PAYLOAD, sessionId: undefined }), // missing required field
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Validation Error");
    expect(body.error.issues).toBeDefined();
  });

  it("should handle empty summary array safely", async () => {
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: "proj_123" }] });

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_PAYLOAD, summary: [] }),
    });

    expect(res.status).toBe(200);
  });
});
