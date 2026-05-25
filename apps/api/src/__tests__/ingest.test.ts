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
  persistReplayBlob: vi.fn().mockResolvedValue(undefined),
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
    // Mock project lookup to succeed (active project)
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: "proj_123" }] });

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify project lookup uses the is_active filter
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT id FROM projects WHERE public_key = $1 AND is_active = true",
      ["pk_test_123"]
    );

    // Verify transaction was used
    expect(withTransaction).toHaveBeenCalled();
    
    // Wait for the deferred setImmediate persistence task to execute
    await new Promise((resolve) => setImmediate(resolve));

    // Verify Blob persistence was called
    expect(persistReplayBlob).toHaveBeenCalledWith(
      "proj_123",
      "sess_abc",
      VALID_PAYLOAD.events
    );
  });

  it("should return 401 for unknown project key and halt pipeline", async () => {
    // Mock project lookup to return no rows (key doesn't exist)
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");

    // Pipeline must NOT proceed — no transaction, no blob writes
    expect(withTransaction).not.toHaveBeenCalled();
    expect(persistReplayBlob).not.toHaveBeenCalled();
  });

  it("should return 401 for disabled project (is_active = false)", async () => {
    // The query filters by is_active = true, so a disabled project returns no rows
    (pool.query as any).mockResolvedValueOnce({ rows: [] });

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_disabled_project" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);

    // Verify the query was issued with the disabled key
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT id FROM projects WHERE public_key = $1 AND is_active = true",
      ["pk_disabled_project"]
    );

    // Pipeline must NOT proceed
    expect(withTransaction).not.toHaveBeenCalled();
    expect(persistReplayBlob).not.toHaveBeenCalled();
  });

  it("should reject malformed payload with 400 Zod Error", async () => {
    const malformedPayload = { ...VALID_PAYLOAD };
    delete (malformedPayload as any).sessionId;

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(malformedPayload),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Validation Error");
    expect(body.error.issues).toBeDefined();

    // Malformed payloads should never reach the DB at all
    expect(pool.query).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    expect(persistReplayBlob).not.toHaveBeenCalled();
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

  // --- Batch Size Enforcement Tests ---

  it("should accept exactly 500 replay events", async () => {
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: "proj_123" }] });

    const payload = {
      ...VALID_PAYLOAD,
      events: Array.from({ length: 500 }, (_, i) => ({ type: 1, data: { i } })),
    };

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    expect(withTransaction).toHaveBeenCalled();
  });

  it("should reject 501 replay events with 400 and halt pipeline", async () => {
    const payload = {
      ...VALID_PAYLOAD,
      events: Array.from({ length: 501 }, (_, i) => ({ type: 1, data: { i } })),
    };

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);

    // Pipeline must NOT proceed
    expect(pool.query).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    expect(persistReplayBlob).not.toHaveBeenCalled();
  });

  it("should accept exactly 50 summary events", async () => {
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: "proj_123" }] });

    const payload = {
      ...VALID_PAYLOAD,
      summary: Array.from({ length: 50 }, (_, i) => ({
        type: "click" as const,
        timestampMs: 1234567900 + i,
        target: `el_${i}`,
      })),
    };

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    expect(withTransaction).toHaveBeenCalled();
  });

  it("should reject 51 summary events with 400 and halt pipeline", async () => {
    const payload = {
      ...VALID_PAYLOAD,
      summary: Array.from({ length: 51 }, (_, i) => ({
        type: "click" as const,
        timestampMs: 1234567900 + i,
        target: `el_${i}`,
      })),
    };

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);

    // Pipeline must NOT proceed
    expect(pool.query).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    expect(persistReplayBlob).not.toHaveBeenCalled();
  });

  it("should reject payload >2MB with 413 and halt pipeline", async () => {
    // Generate a payload that exceeds 2MB when serialized
    const hugePayload = {
      ...VALID_PAYLOAD,
      events: Array.from({ length: 500 }, () => ({
        type: 1,
        data: { bloat: "x".repeat(5000) },
      })),
    };

    const res = await app.request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hugePayload),
    });

    expect(res.status).toBe(413);

    // Pipeline must NOT proceed
    expect(pool.query).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    expect(persistReplayBlob).not.toHaveBeenCalled();
  });
});
