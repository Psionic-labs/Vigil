import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateUniqueProjectKey } from "../lib/project-key";

describe("Project Key Generation", () => {
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
  });

  it("should generate a key with the correct prefix and entropy", async () => {
    mockPool.query.mockResolvedValue({ rowCount: 0 });
    const key = await generateUniqueProjectKey(mockPool);
    
    expect(key).toMatch(/^pk_live_[A-Za-z0-9_-]+$/);
    // Prefix (8 chars) + base64url of 16 bytes (22 chars) = 30 chars
    expect(key.length).toBe(30);
  });

  it("should retry generation on collision and return a unique key", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rowCount: 1 }) // First attempt collides
      .mockResolvedValueOnce({ rowCount: 0 }); // Second attempt succeeds

    const key = await generateUniqueProjectKey(mockPool);
    
    expect(key).toMatch(/^pk_live_[A-Za-z0-9_-]+$/);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it("should throw an error if maximum retries are exceeded", async () => {
    mockPool.query.mockResolvedValue({ rowCount: 1 }); // Always collides

    await expect(generateUniqueProjectKey(mockPool, 3)).rejects.toThrow(
      "Failed to generate a unique project key after maximum retries"
    );
    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });
});
