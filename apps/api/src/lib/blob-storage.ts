/**
 * @file blob-storage.ts
 * @description Manages local or cloud-based file persistence for session replay recording payloads.
 * @why Decouples heavy file storage from the transactional database to optimize performance.
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

// Configure the root blobs directory (local directory for this architecture phase).
const BLOBS_ROOT = process.env.BLOBS_ROOT || path.resolve(__dirname, "../../blobs/v1");

/**
 * BlobPersistenceResult
 * Aggregates diagnostic results returned upon successful file writes.
 * Enables tracking serialization, compression, and write performance statistics.
 */
export interface BlobPersistenceResult {
  path: string;                      // Final resolved absolute file path
  compressedBytes: number;           // Gzip compressed byte count size
  serializationMs: number;           // Time spent converting JSON array to string
  compressionMs: number;             // Time spent running Gzip compression algorithm
  writeMs: number;                   // Time spent performing disk writes
  // Compatibility fields mapping
  filePath: string;
  compressedSize: number;
  serializationDurationMs: number;
  compressionDurationMs: number;
  writeDurationMs: number;
}

/**
 * ensureDirectoryExists
 * Checks and creates the directory paths recursively if they do not exist.
 *
 * @param dirPath The absolute path to verify/create.
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * persistReplayBlob
 * Compresses and saves raw rrweb events as a gzipped file chunk.
 *
 * @param projectId Scope project ID identifier
 * @param sessionId Scope session ID identifier
 * @param events Array of raw replay interaction event frames
 * @returns BlobPersistenceResult details or null if events array was empty.
 *
 * How it works:
 * 1. Checks bounds: validates that projectId and sessionId match expected alphanumeric patterns to block path injections.
 * 2. Serialization: converts events array to JSON string.
 * 3. Compression: applies gzip compression asynchronously.
 * 4. Resolves path: verifies that the resolved write target starts with the BLOBS_ROOT path prefix to block path traversal.
 * 5. Atomic Disk Write: writes to a temporary (.tmp) file first, then atomically renames it to the target file name
 *    to avoid partial reads during parallel ingestion cycles.
 */
export async function persistReplayBlob(
  projectId: string,
  sessionId: string,
  events: unknown[]
): Promise<BlobPersistenceResult | null> {
  if (!events || events.length === 0) {
    return null;
  }

  // 1. Sanitize & bound user-controlled identifiers to prevent injection
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

  const relativeDir = path.relative(resolvedBlobsRoot, dirPath);
  if (relativeDir.startsWith("..") || path.isAbsolute(relativeDir)) {
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
    path: filePath,
    compressedBytes: compressed.length,
    serializationMs: serializationDurationMs,
    compressionMs: compressionDurationMs,
    writeMs: writeDurationMs,
    filePath,
    compressedSize: compressed.length,
    serializationDurationMs,
    compressionDurationMs,
    writeDurationMs,
  };
}
