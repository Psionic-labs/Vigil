import { describe, it, expect } from "vitest";
import app from "../app";

describe("Health API", () => {
  it("should return ok status on /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
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
