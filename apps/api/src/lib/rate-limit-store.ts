/**
 * @file rate-limit-store.ts
 * @description Implements in-memory caching and stores for IP and project rate-limiting.
 * @why Protects API ingestion endpoints from DDOS attacks and unauthorized keys.
 */


export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
  reason?: "ip" | "project" | "session";
}

export interface LimiterStore {
  consume(
    category: "ip" | "project" | "session",
    key: string,
    limit: number,
    windowMs: number,
    cost: number,
    burstMultiplier: number,
    maxBuckets: number
  ): Promise<RateLimitDecision>;
}

interface Bucket {
  tokens: number;
  lastRefilled: number;
  lastAccessed: number;
  refillRate: number;
  burstLimit: number;
}

export class InMemoryLimiterStore implements LimiterStore {
  private ipBuckets = new Map<string, Bucket>();
  private projectBuckets = new Map<string, Bucket>();
  private sessionBuckets = new Map<string, Bucket>();

  public ipLimitedHits = 0;
  public projectLimitedHits = 0;
  public sessionLimitedHits = 0;
  public cardinalityEvictions = 0;

  private getMap(category: "ip" | "project" | "session"): Map<string, Bucket> {
    if (category === "ip") return this.ipBuckets;
    if (category === "project") return this.projectBuckets;
    return this.sessionBuckets;
  }

  private incrementLimitedHits(category: "ip" | "project" | "session") {
    if (category === "ip") this.ipLimitedHits++;
    else if (category === "project") this.projectLimitedHits++;
    else if (category === "session") this.sessionLimitedHits++;
  }

  private isBucketIdle(bucket: Bucket, now: number): boolean {
    const elapsedMs = Math.max(0, now - bucket.lastRefilled);
    const addedTokens = elapsedMs * bucket.refillRate;
    const currentTokens = Math.min(bucket.burstLimit, bucket.tokens + addedTokens);

    return currentTokens >= bucket.burstLimit;
  }

  private evictBuckets(category: "ip" | "project" | "session", map: Map<string, Bucket>) {
    const now = Date.now();
    const toEvict = 10; // Evict in small batches to reduce frequency of eviction checks
    const keysToEvict: string[] = [];

    // 1. Scan in insertion order (least recently used / LRU) and gather idle buckets first
    for (const [key, bucket] of map.entries()) {
      if (keysToEvict.length >= toEvict) break;
      if (this.isBucketIdle(bucket, now)) {
        keysToEvict.push(key);
      }
    }

    // 2. If we need more buckets to evict, fallback to the LRU non-idle buckets
    if (keysToEvict.length < toEvict) {
      for (const key of map.keys()) {
        if (keysToEvict.length >= toEvict) break;
        if (!keysToEvict.includes(key)) {
          keysToEvict.push(key);
        }
      }
    }

    // Perform deletions
    for (const key of keysToEvict) {
      map.delete(key);
    }

    this.cardinalityEvictions += keysToEvict.length;
    console.debug(
      `[RateLimit] Cardinality threshold exceeded | Category: ${category} | Evicted ${keysToEvict.length} buckets (idle prioritized).`
    );
  }

  async consume(
    category: "ip" | "project" | "session",
    key: string,
    limit: number,
    windowMs: number,
    cost: number,
    burstMultiplier: number,
    maxBuckets: number
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    const map = this.getMap(category);

    // Cardinality Protection
    if (!map.has(key) && map.size >= maxBuckets) {
      this.evictBuckets(category, map);
    }

    const refillRate = limit / windowMs; // tokens per ms
    const burstLimit = Math.max(1, Math.floor(limit * burstMultiplier));

    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        tokens: burstLimit,
        lastRefilled: now,
        lastAccessed: now,
        refillRate,
        burstLimit,
      };
      map.set(key, bucket);
    } else {
      bucket.lastAccessed = now;
      // In case limits changed dynamically
      bucket.refillRate = refillRate;
      bucket.burstLimit = burstLimit;
      // Refresh Map insertion order for O(1) LRU eviction fallback
      map.delete(key);
      map.set(key, bucket);
    }

    const elapsedMs = Math.max(0, now - bucket.lastRefilled);
    const addedTokens = elapsedMs * refillRate;
    const currentTokens = Math.min(burstLimit, bucket.tokens + addedTokens);

    if (currentTokens >= cost) {
      bucket.tokens = currentTokens - cost;
      bucket.lastRefilled = now;
      map.set(key, bucket);

      const resetTimeMs = now + Math.max(0, (burstLimit - bucket.tokens) / refillRate);
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetTimeMs,
      };
    } else {
      const neededTokens = cost - currentTokens;
      const retryAfterMs = neededTokens / refillRate;
      const resetTimeMs = now + retryAfterMs;

      this.incrementLimitedHits(category);

      return {
        allowed: false,
        remaining: Math.floor(currentTokens),
        resetTimeMs,
        reason: category,
      };
    }
  }

  /**
   * getSizes
   * Returns the current number of active tracking buckets for each rate limiter category.
   * Useful for telemetry, cardinality monitoring, and health status reporting.
   */
  public getSizes() {
    return {
      ip: this.ipBuckets.size,
      project: this.projectBuckets.size,
      session: this.sessionBuckets.size,
    };
  }

  /**
   * getEstimatedMemoryUsageBytes
   * Calculates a heuristic approximation of the memory footprint of the rate-limiter maps.
   * Counts UTF-16 character memory allocations, JS objects, and Map metadata overheads.
   * 
   * @returns Approximated allocated memory size in bytes.
   */
  public getEstimatedMemoryUsageBytes(): number {
    const ipSize = this.ipBuckets.size;
    const projectSize = this.projectBuckets.size;
    const sessionSize = this.sessionBuckets.size;
    const totalSize = ipSize + projectSize + sessionSize;

    // Estimate: keys (UTF-16 string chars count * 2) + Bucket object (~112 bytes) + Map overhead (~128 bytes)
    const ipKeyMem = ipSize * (15 * 2);
    const projectKeyMem = projectSize * (40 * 2);
    const sessionKeyMem = sessionSize * (36 * 2);
    const valAndMapOverhead = totalSize * 240; // increased from 208 due to refillRate and burstLimit fields

    return ipKeyMem + projectKeyMem + sessionKeyMem + valAndMapOverhead;
  }

  /**
   * performCleanup
   * Iterates through the rate limiter maps and evicts expired or completely refilled/idle buckets.
   * Frees memory and keeps heap utilization optimized under continuous request loads.
   *
   * @param ttlMs Inactivity duration threshold before bucket eviction (e.g. 15 minutes).
   * @returns Total number of cleared rate limiting buckets.
   */
  public performCleanup(ttlMs: number) {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, bucket] of this.ipBuckets.entries()) {
      if (now - bucket.lastAccessed >= ttlMs || this.isBucketIdle(bucket, now)) {
        this.ipBuckets.delete(key);
        cleaned++;
      }
    }
    for (const [key, bucket] of this.projectBuckets.entries()) {
      if (now - bucket.lastAccessed >= ttlMs || this.isBucketIdle(bucket, now)) {
        this.projectBuckets.delete(key);
        cleaned++;
      }
    }
    for (const [key, bucket] of this.sessionBuckets.entries()) {
      if (now - bucket.lastAccessed >= ttlMs || this.isBucketIdle(bucket, now)) {
        this.sessionBuckets.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * clearAll
   * Force resets all rate limiting buckets and telemetry counters.
   * Primarily used for clearing state between unit tests.
   */
  public clearAll() {
    this.ipBuckets.clear();
    this.projectBuckets.clear();
    this.sessionBuckets.clear();
    this.ipLimitedHits = 0;
    this.projectLimitedHits = 0;
    this.sessionLimitedHits = 0;
    this.cardinalityEvictions = 0;
  }
}

/**
 * ProjectCacheEntry
 * Defines the structure for cached project credential validation results.
 */
export interface ProjectCacheEntry {
  valid: boolean;         // Indication of project key validity
  projectId?: string;     // Unique database project ID if valid
  expiresAt: number;      // Epoch timestamp when cache entry expires
}

/**
 * KnownProjectCache
 * Light-weight, in-memory cache to store project validation query outcomes.
 * Prevents redundant database hits for project validation during ingestion.
 */
export class KnownProjectCache {
  private cache = new Map<string, ProjectCacheEntry>();
  public hits = 0;        // Track cache lookup successes
  public misses = 0;      // Track cache lookup misses

  /**
   * get
   * Retrieves a cached project validation entry if it exists and has not expired.
   *
   * @param key The public project key credentials.
   * @returns ProjectCacheEntry object or null if not found or expired.
   */
  get(key: string): ProjectCacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry;
  }

  /**
   * set
   * Stores project key validation state with a configurable Time-To-Live (TTL).
   *
   * @param key The public project key credentials.
   * @param valid Validity status flag.
   * @param projectId Resolved database project ID.
   * @param ttlMs Time to live in milliseconds (defaults to 1 minute).
   */
  set(key: string, valid: boolean, projectId?: string, ttlMs: number = 60000) {
    this.cache.set(key, {
      valid,
      projectId,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * getCacheSize
   * Returns current count of entries tracked in cache.
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * performCleanup
   * Scans and evicts expired project validation cache entries.
   * 
   * @returns Count of evicted cache entries.
   */
  performCleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * invalidate
   * Removes a specific project key from the cache immediately.
   * Call this when a project is deactivated or its key is revoked to close
   * the authorization window where a cached entry could bypass the is_active check.
   *
   * @param key The public project key to invalidate.
   * @returns true if the key was found and removed, false otherwise.
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * clear
   * Empties cache map and resets hits/misses metrics tracker.
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

// Global Singleton Instances shared across request routers and middlewares
export const globalLimiterStore = new InMemoryLimiterStore();
export const globalProjectCache = new KnownProjectCache();

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * startLimiterCleanup
 * Sets up a background garbage-collection interval timer.
 * Periodically purges idle rate-limiting buckets and expired project key caches.
 *
 * @param storeTtlMs Time-to-live expiration limit for inactive rate limit buckets.
 * @param intervalMs Cycle execution interval frequency.
 */
export function startLimiterCleanup(
  storeTtlMs: number = 900000,
  intervalMs: number = 60000
) {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    try {
      globalLimiterStore.performCleanup(storeTtlMs);
      globalProjectCache.performCleanup();
    } catch (err) {
      console.error("[RateLimit] GC cleanup cycle failed:", err);
    }
  }, intervalMs);
}

/**
 * stopLimiterCleanup
 * Terminates the background garbage collection timers for safe process shutdown.
 */
export function stopLimiterCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

