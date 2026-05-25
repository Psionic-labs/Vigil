/**
 * @file blob-storage.ts
 * @description Local disk filesystem-based gzipped blob persistence.
 * @how Compresses raw rrweb replay arrays into gzip and writes them to unique file paths.
 * @why Stores heavy DOM replay timelines efficiently on local disk without bloating the relational DB.
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const gzip = promisify(zlib.gzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure the root blobs directory
// For this milestone, a local 'blobs' directory is sufficient.
const BLOBS_ROOT = process.env.BLOBS_ROOT || path.resolve(__dirname, "../../blobs/v1");

export interface BlobPersistenceResult {
  filePath: string;
  compressedSize: number;
  serializationDurationMs: number;
  compressionDurationMs: number;
  writeDurationMs: number;
}

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
): Promise<BlobPersistenceResult | null> {
  if (!events || events.length === 0) {
    return null;
  }

  // 1. Sanitize & bound user-controlled identifiers
  const safeIdRegex = /^[A-Za-z0-9_-]+$/;
  if (
    !projectId ||
    projectId.length > 100 ||
    !safeIdRegex.test(projectId) ||
    !sessionId ||
    sessionId.length > 100 ||
    !safeIdRegex.test(sessionId)
  ) {
    throw new Error("Invalid or unsafe projectId/sessionId for blob storage.");
  }

  // 2. Measure Serialization
  const serializationStart = performance.now();
  const serialized = JSON.stringify(events);
  const serializationDurationMs = performance.now() - serializationStart;

  // 3. Measure Compression
  const compressionStart = performance.now();
  const compressed = await gzip(serialized);
  const compressionDurationMs = performance.now() - compressionStart;

  // 4. Construct path and enforce directory traversal checks
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString("hex");
  
  const resolvedBlobsRoot = path.resolve(BLOBS_ROOT);
  const dirPath = path.resolve(resolvedBlobsRoot, projectId, sessionId);

  if (!dirPath.startsWith(resolvedBlobsRoot)) {
    throw new Error("Path traversal detected.");
  }

  const tempFilePath = path.join(dirPath, `${timestamp}_${randomSuffix}_events.json.gz.tmp`);
  const filePath = path.join(dirPath, `${timestamp}_${randomSuffix}_events.json.gz`);

  // 5. Measure Atomic Disk Write
  const writeStart = performance.now();
  await ensureDirectoryExists(dirPath);
  await fs.writeFile(tempFilePath, compressed);
  await fs.rename(tempFilePath, filePath);
  const writeDurationMs = performance.now() - writeStart;

  return {
    filePath,
    compressedSize: compressed.length,
    serializationDurationMs,
    compressionDurationMs,
    writeDurationMs,
  };
}
