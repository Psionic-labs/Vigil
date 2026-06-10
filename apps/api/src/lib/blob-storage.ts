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
const gunzip = promisify(zlib.gunzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure the root blobs directory (local directory for this architecture phase).
const BLOBS_ROOT = process.env.BLOBS_ROOT || path.resolve(__dirname, "../../blobs/v1");

// In-memory cache for parsed replay events to avoid re-reading and re-processing blob files.
const CACHE_TTL_MS = 60_000; // 1 minute
const MAX_CACHE_ENTRIES = 50;
const eventCache = new Map<string, { events: unknown[]; timestamp: number }>();

function getCachedEvents(key: string): unknown[] | null {
  const entry = eventCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.events;
  }
  eventCache.delete(key);
  return null;
}

function setCachedEvents(key: string, events: unknown[]): void {
  if (eventCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = eventCache.keys().next().value;
    if (oldest !== undefined) eventCache.delete(oldest);
  }
  eventCache.set(key, { events, timestamp: Date.now() });
}

function invalidateSessionCache(projectId: string, sessionId: string): void {
  eventCache.delete(`${projectId}:${sessionId}`);
}

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

  // Invalidate the in-memory cache so subsequent reads pick up the new batch
  invalidateSessionCache(projectId, sessionId);

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

/**
 * readReplayBlob
 * Reads and decompresses events from a gzipped file path.
 *
 * @param blobPath Saved relative path from sessions table (starts with blobs/v1)
 * @returns Array of parsed rrweb events
 */
export async function readReplayBlob(blobPath: string): Promise<unknown[]> {
  const resolvedBlobsRoot = path.resolve(BLOBS_ROOT);
  // blobPath is stored as a relative path starting with blobs/v1/, so resolve
  // from BLOBS_ROOT's parent to keep path resolution consistent with writes.
  const fullPath = path.resolve(resolvedBlobsRoot, "../..", blobPath);

  // Path traversal check
  const relative = path.relative(resolvedBlobsRoot, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal detected.");
  }

  const compressed = await fs.readFile(fullPath);
  const decompressed = await gunzip(compressed);
  return JSON.parse(decompressed.toString("utf8"));
}

/**
 * readAllSessionEvents
 * Finds, decompresses, and merges all event batches for a session.
 * Enforces chronological sorting, duplicate detection, missing batch tolerance, and replay validation.
 *
 * @param projectId Scope project ID identifier
 * @param sessionId Scope session ID identifier
 * @returns Concatenated, validated, and unique rrweb events array
 */
export async function readAllSessionEvents(
  projectId: string,
  sessionId: string
): Promise<unknown[]> {
  const cacheKey = `${projectId}:${sessionId}`;
  const cached = getCachedEvents(cacheKey);
  if (cached) return cached;

  const resolvedBlobsRoot = path.resolve(BLOBS_ROOT);
  const dirPath = path.resolve(resolvedBlobsRoot, projectId, sessionId);

  // Path traversal check
  const relative = path.relative(resolvedBlobsRoot, dirPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal detected.");
  }

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const eventFiles = files
    .filter((f) => f.endsWith("_events.json.gz"))
    .sort(); // Lexicographical sort is chronological due to timestamp prefix

  // Read and decompress all batch files concurrently
  const batchResults = await Promise.allSettled(
    eventFiles.map(async (file) => {
      const fullPath = path.join(dirPath, file);
      const compressed = await fs.readFile(fullPath);
      const decompressed = await gunzip(compressed);
      const parsed = JSON.parse(decompressed.toString("utf8"));
      if (!Array.isArray(parsed)) {
        console.warn(`[BlobStorage] Skipping non-array event file: ${file}`);
        return [];
      }
      return parsed as unknown[];
    })
  );

  const eventBatches: unknown[][] = [];
  for (const result of batchResults) {
    if (result.status === "fulfilled") {
      eventBatches.push(result.value);
    } else {
      console.warn("[BlobStorage] Skipping unreadable batch:", result.reason?.message);
    }
  }

  const mergedEvents = eventBatches.flat();

  // Deduplicate by constructing a deterministic key
  const seen = new Set<string>();
  const uniqueEvents: any[] = [];
  for (const event of mergedEvents) {
    if (!event || typeof event !== "object") continue;
    const type = (event as any).type;
    const timestamp = (event as any).timestamp;
    const dataStr = JSON.stringify((event as any).data || {});
    const key = `${type}:${timestamp}:${dataStr}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEvents.push(event);
    }
  }

  // Sort by timestamp to guarantee deterministic replay ordering
  uniqueEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Replay validation: verify it contains metadata (type 4) and full snapshot (type 2)
  if (uniqueEvents.length > 0) {
    const hasMeta = uniqueEvents.some((e) => e.type === 4);
    const hasFullSnapshot = uniqueEvents.some((e) => e.type === 2);
    if (!hasMeta || !hasFullSnapshot) {
      throw new Error("Missing metadata or full snapshot in replay events");
    }
  }

  setCachedEvents(cacheKey, uniqueEvents);
  return uniqueEvents;
}


