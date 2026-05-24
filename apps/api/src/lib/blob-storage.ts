import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gzip = promisify(zlib.gzip);

// Configure the root blobs directory relative to process.cwd()
// For this milestone, a local 'blobs' directory is sufficient.
const BLOBS_ROOT = path.join(process.cwd(), "blobs", "v1");

/**
 * Ensures the target directory exists before writing.
 * @param dirPath The absolute path to the directory
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
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

  // 1. Serialize
  const serialized = JSON.stringify(events);

  // 2. Compress
  const compressed = await gzip(serialized);

  // 3. Construct immutable chunk path
  const timestamp = Date.now();
  const dirPath = path.join(BLOBS_ROOT, projectId, sessionId);
  const filePath = path.join(dirPath, `${timestamp}_events.json.gz`);

  // 4. Ensure directory exists and write
  await ensureDirectoryExists(dirPath);
  await fs.writeFile(filePath, compressed);
}
