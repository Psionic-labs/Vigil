import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import crypto from "node:crypto";

const gzip = promisify(zlib.gzip);

// Configure the root blobs directory
// For this milestone, a local 'blobs' directory is sufficient.
const BLOBS_ROOT = process.env.BLOBS_ROOT || path.resolve(__dirname, "../../blobs/v1");

/**
 * Ensures the target directory exists before writing.
 * @param dirPath The absolute path to the directory
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Persists raw rrweb events as a compressed gzip chunk.
 * 
 * @param projectId The project ID.
 * @param sessionId The session ID.
 * @param events The raw events array to persist.
 */
export async function persistReplayBlob(
  projectId: string,
  sessionId: string,
  events: unknown[]
): Promise<void> {
  if (!events || events.length === 0) {
    return;
  }

  const safeIdRegex = /^[A-Za-z0-9._-]+$/;
  if (!safeIdRegex.test(projectId) || !safeIdRegex.test(sessionId)) {
    throw new Error("Invalid projectId or sessionId for blob storage.");
  }

  // 1. Serialize
  const serialized = JSON.stringify(events);

  // 2. Compress
  const compressed = await gzip(serialized);

  // 3. Construct immutable chunk path
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString("hex");
  const dirPath = path.resolve(BLOBS_ROOT, projectId, sessionId);

  if (!dirPath.startsWith(path.resolve(BLOBS_ROOT))) {
    throw new Error("Path traversal detected.");
  }

  const filePath = path.join(dirPath, `${timestamp}_${randomSuffix}_events.json.gz`);

  // 4. Ensure directory exists and write
  await ensureDirectoryExists(dirPath);
  await fs.writeFile(filePath, compressed);
}
