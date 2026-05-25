import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const gunzip = promisify(zlib.gunzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_BLOBS_ROOT = path.resolve(__dirname, "../../test-blobs");

import type { persistReplayBlob as persistReplayBlobFn } from "../lib/blob-storage";

let persistReplayBlob: typeof persistReplayBlobFn;

beforeAll(async () => {
  process.env.BLOBS_ROOT = TEST_BLOBS_ROOT;
  const mod = await import("../lib/blob-storage");
  persistReplayBlob = mod.persistReplayBlob;
});

async function cleanUpTestBlobs() {
  try {
    await fs.rm(TEST_BLOBS_ROOT, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe("Local Replay Blob Persistence", () => {
  beforeEach(async () => {
    await cleanUpTestBlobs();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanUpTestBlobs();
  });

  it("should skip persistence and return null when events array is empty or null", async () => {
    const resEmpty = await persistReplayBlob("proj1", "sess1", []);
    expect(resEmpty).toBeNull();

    const resNull = await persistReplayBlob("proj1", "sess1", null as any);
    expect(resNull).toBeNull();
  });

  it("should validate and throw an error for unsafe or invalid project/session IDs", async () => {
    const invalidIds = [
      "",
      "a".repeat(101),
      "project/dir",
      "project\\dir",
      "project..dir",
      "proj abc",
      "proj$123",
      "../traversal",
    ];

    for (const badId of invalidIds) {
      await expect(
        persistReplayBlob(badId, "sess1", [{ type: 1 }])
      ).rejects.toThrow("Invalid or unsafe projectId/sessionId for blob storage.");

      await expect(
        persistReplayBlob("proj1", badId, [{ type: 1 }])
      ).rejects.toThrow("Invalid or unsafe projectId/sessionId for blob storage.");
    }
  });

  it("should successfully compress and persist events with correct path structure", async () => {
    const events = [
      { type: 1, timestamp: 1000, data: { x: 10, y: 20 } },
      { type: 2, timestamp: 1100, data: { x: 15, y: 25 } },
    ];

    const result = await persistReplayBlob("proj_1", "sess_abc-123", events);

    expect(result).not.toBeNull();
    const res = result!;
    expect(res.filePath).toContain("proj_1");
    expect(res.filePath).toContain("sess_abc-123");
    expect(res.filePath).toMatch(/_events\.json\.gz$/);
    expect(res.compressedSize).toBeGreaterThan(0);
    expect(res.serializationDurationMs).toBeGreaterThanOrEqual(0);
    expect(res.compressionDurationMs).toBeGreaterThanOrEqual(0);
    expect(res.writeDurationMs).toBeGreaterThanOrEqual(0);

    // Verify the file was written and is valid gzip
    const fileExists = await fs.access(res.filePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const fileBuffer = await fs.readFile(res.filePath);
    const decompressed = await gunzip(fileBuffer);
    const parsed = JSON.parse(decompressed.toString("utf-8"));

    expect(parsed).toEqual(events);
  });

  it("should support concurrent writes to the same project/session without collisions", async () => {
    const events = [{ type: 4, timestamp: 2000 }];

    // Trigger multiple writes in parallel
    const writePromises = Array.from({ length: 5 }).map(() =>
      persistReplayBlob("proj_concurrent", "sess_concurrent", events)
    );

    const results = await Promise.all(writePromises);

    const filePaths = results.map((r) => r!.filePath);
    // All file paths should be unique
    const uniquePaths = new Set(filePaths);
    expect(uniquePaths.size).toBe(5);

    // Verify all files exist
    for (const filePath of filePaths) {
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    }
  });

  it("should use atomic rename semantics (write to .tmp then rename)", async () => {
    const events = [{ type: 9, data: "atomic" }];

    const writeFileSpy = vi.spyOn(fs, "writeFile");
    const renameSpy = vi.spyOn(fs, "rename");

    const result = await persistReplayBlob("proj_atomic", "sess_atomic", events);
    expect(result).not.toBeNull();

    expect(writeFileSpy).toHaveBeenCalledTimes(1);
    expect(renameSpy).toHaveBeenCalledTimes(1);

    const tempPathArg = writeFileSpy.mock.calls[0]![0] as string;
    const renameSrcArg = renameSpy.mock.calls[0]![0] as string;
    const renameDestArg = renameSpy.mock.calls[0]![1] as string;

    expect(tempPathArg).toContain(".tmp");
    expect(renameSrcArg).toBe(tempPathArg);
    expect(renameDestArg).toBe(result!.filePath);
    expect(renameDestArg).not.toContain(".tmp");
  });

  it("should bubble up filesystem write errors", async () => {
    const events = [{ type: 10 }];

    // Mock writeFile to throw an error
    vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("Disk full or permission denied"));

    await expect(
      persistReplayBlob("proj_fail", "sess_fail", events)
    ).rejects.toThrow("Disk full or permission denied");
  });
});
