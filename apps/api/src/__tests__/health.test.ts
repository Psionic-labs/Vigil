/**
 * @file health.test.ts
 * @description Integration tests for liveness and database readiness checks.
 * @why Verifies `/health/live` and `/health/ready` endpoints return correct status codes and payloads under both healthy and unhealthy database states.
 */

import { describe, it, expect, vi } from "vitest";
import app from "../app";
import { checkDatabaseConnection } from "../db";

// Mock the database client to verify behavior without making real database connections
vi.mock("../db", () => ({
  checkDatabaseConnection: vi.fn(),
  pool: {
    totalCount: 5,
    idleCount: 3,
    waitingCount: 1,
  },
}));

describe("Health API", () => {
  it("should return ok status on /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
  });

  it("should return ok status on /health/live", async () => {
    const res = await app.request("/health/live");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
  });

  it("should return ready status on /health/ready when database is healthy", async () => {
    // Mock healthy database check
    const mockDbTime = new Date().toISOString();
    vi.mocked(checkDatabaseConnection).mockResolvedValueOnce(mockDbTime);

    const res = await app.request("/health/ready");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toHaveProperty("status", "ready");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
    expect(body.database).toEqual({
      status: "connected",
      time: mockDbTime,
    });
    expect(body.pool).toEqual({
      totalConnections: 5,
      idleConnections: 3,
      waitingRequests: 1,
    });
  });

  it("should return 503 Service Unavailable on /health/ready when database fails", async () => {
    // Mock database check failure
    vi.mocked(checkDatabaseConnection).mockRejectedValueOnce(new Error("Database Connection Timeout"));

    const res = await app.request("/health/ready");
    expect(res.status).toBe(503);
    
    const body = await res.json();
    expect(body).toHaveProperty("status", "unhealthy");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
    expect(body.database).toEqual({
      status: "disconnected",
      error: "Database Connection Timeout",
    });
    expect(body.pool).toEqual({
      totalConnections: 5,
      idleConnections: 3,
      waitingRequests: 1,
    });
  });

  it("should handle 404s cleanly with global error handler", async () => {
    // Making a request to a non-existent route
    const res = await app.request("/non-existent-route");
    expect(res.status).toBe(404);
    
    // Check that our global error handler caught it
    const body = await res.json();
    expect(body).toHaveProperty("success", false);
    expect(body.error).toHaveProperty("message");
    expect(body.error.code).toBe(404);
  });
});

