import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import app from "../app";
import { pool } from "../db";
import {
  globalLimiterStore,
  globalProjectCache,
  startLimiterCleanup,
  stopLimiterCleanup,
} from "../lib/rate-limit-store";
import { getEnvConfig } from "../middleware/rate-limit";

vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
  withTransaction: vi.fn(async (cb) => {
    const fakeClient = { query: vi.fn() };
    await cb(fakeClient);
    return fakeClient;
  }),
}));

vi.mock("../lib/blob-storage", () => ({
  persistReplayBlob: vi.fn().mockResolvedValue(undefined),
}));

const VALID_PAYLOAD = {
  projectKey: "pk_valid",
  sessionId: "sess_1",
  metadata: {
    url: "http://localhost",
    userAgent: "vitest",
    startedAt: 1234567890,
    screenWidth: 1024,
    screenHeight: 768,
  },
  summary: [],
  events: [],
  isFinal: false,
  sdkVersion: "1.0.0",
};

describe("Rate Limiting & Abuse Protection Suite", () => {
  beforeAll(() => {
    startLimiterCleanup(900000, 100);
  });

  afterAll(() => {
    stopLimiterCleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    globalLimiterStore.clearAll();
    globalProjectCache.clear();

    // Reset env config variables to default
    process.env.ENABLE_TEST_CACHE = "true";
    delete process.env.INGEST_IP_RPM;
    delete process.env.INGEST_PROJECT_RPM;
    delete process.env.INGEST_SESSION_RPM;
    delete process.env.INGEST_UNKNOWN_PROJECT_RPM;
    delete process.env.INGEST_BURST_MULTIPLIER;
    delete process.env.INGEST_UNKNOWN_PROJECT_BURST_MULTIPLIER;
    delete process.env.KNOWN_PROJECT_CACHE_TTL_MS;
    delete process.env.RATE_LIMIT_MAX_IP_BUCKETS;
    delete process.env.RATE_LIMIT_MAX_PROJECT_BUCKETS;
    delete process.env.RATE_LIMIT_MAX_SESSION_BUCKETS;
    delete process.env.TRUST_PROXY;
    delete process.env.ENABLE_INTERNAL_METRICS;
    delete process.env.INTERNAL_METRICS_TOKEN;
  });

  // 1. IP Rate Limiting Tests
  describe("IP Rate Limiting", () => {
    it("should allow requests under the limit and return 429 when exceeded", async () => {
      process.env.INGEST_IP_RPM = "2";
      process.env.INGEST_BURST_MULTIPLIER = "1.0"; // no burst for test predictability

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // Request 1: Allowed
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "1.1.1.1" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(200);

      // Request 2: Allowed
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "1.1.1.1" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(200);

      // Request 3: Blocked (429)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "1.1.1.1" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeDefined();
      expect(res.headers.get("X-RateLimit-Limit")).toBe("2");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();

      const body = await res.json();
      expect(body.error).toBe("Too Many Requests");
      expect(body.reason).toBe("ip");
    });

    it("should not trust X-Forwarded-For headers when TRUST_PROXY is false", async () => {
      process.env.INGEST_IP_RPM = "1";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";
      process.env.TRUST_PROXY = "false";

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // First request: client IP will fall back to socket/undefined (IP X)
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.1" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(200);

      // Second request: with a different header, but since trustProxy is false, it still targets IP X
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "20.0.0.2" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(429);
    });

    it("should trust X-Forwarded-For headers when TRUST_PROXY is true", async () => {
      process.env.INGEST_IP_RPM = "1";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";
      process.env.TRUST_PROXY = "true";

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // Request 1: IP A
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.1" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(200);

      // Request 2: IP B (Allowed because it uses a different IP bucket)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "20.0.0.2" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(200);
    });
  });

  // 2. Project Rate Limiting and DB lookup protection
  describe("Project Rate Limiting & Protection", () => {
    it("should rate limit known projects independently", async () => {
      process.env.INGEST_PROJECT_RPM = "1";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // Request 1: Project A
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_proj_a" }),
      });
      expect(res.status).toBe(200);

      // Request 2: Project A (Blocked)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_proj_a" }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.reason).toBe("project");

      // Request 3: Project B (Allowed)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_proj_b" }),
      });
      expect(res.status).toBe(200);
    });

    it("should prevent DB lookup amplification by routing unknown keys to a shared __unknown_project__ bucket", async () => {
      process.env.INGEST_UNKNOWN_PROJECT_RPM = "2";
      process.env.INGEST_UNKNOWN_PROJECT_BURST_MULTIPLIER = "1.0";

      // Mock database project lookup to return empty array (invalid key)
      (pool.query as any).mockResolvedValue({ rows: [] });

      // Request 1: key_1 (queries DB -> returns 401)
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_unknown_1" }),
      });
      expect(res.status).toBe(401);

      // Request 2: key_2 (queries DB -> returns 401)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_unknown_2" }),
      });
      expect(res.status).toBe(401);

      // Verify DB was queried 2 times
      expect(pool.query).toHaveBeenCalledTimes(2);

      // Request 3: key_3 (Blocked by shared __unknown_project__ limiter. No DB validation query runs!)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_unknown_3" }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.reason).toBe("project");

      // Verify DB validation query count remains at 2 (no lookup amplification!)
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it("should implement Cache Stampede protection and run exactly 1 database query for concurrent duplicate key lookups", async () => {
      // Setup mock query to resolve slowly
      (pool.query as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ rows: [{ id: "proj_lazy" }] }), 50))
      );

      // Spawn 5 concurrent lookups for same project key
      const requests = Array.from({ length: 5 }).map(() =>
        app.request("/api/v1/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_lazy" }),
        })
      );

      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // Verify only 1 database query was made
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it("should negative-cache invalid keys to avoid repeated database lookups", async () => {
      (pool.query as any).mockResolvedValue({ rows: [] }); // key invalid

      // Request 1: hits DB -> 401
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_invalid" }),
      });
      expect(res.status).toBe(401);

      // Request 2: hits cache -> 401 directly
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_invalid" }),
      });
      expect(res.status).toBe(401);

      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  // 3. Session Rate Limiting Tests
  describe("Session Rate Limiting", () => {
    it("should rate limit sessions independently", async () => {
      process.env.INGEST_SESSION_RPM = "1";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // Request 1: Session A
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, sessionId: "sess_a" }),
      });
      expect(res.status).toBe(200);

      // Request 2: Session A (Blocked)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, sessionId: "sess_a" }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.reason).toBe("session");

      // Request 3: Session B (Allowed)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, sessionId: "sess_b" }),
      });
      expect(res.status).toBe(200);
    });
  });

  // 4. Cardinality Protection Tests
  describe("Cardinality Protection", () => {
    it("should evict oldest insertion buckets in batch when limit thresholds are reached", async () => {
      process.env.RATE_LIMIT_MAX_IP_BUCKETS = "3"; // Small bucket limit
      process.env.INGEST_IP_RPM = "10";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";
      process.env.TRUST_PROXY = "true";

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // Create buckets for 3 IPs
      await app.request("/api/v1/ingest", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "1.1.1.1" }, body: JSON.stringify(VALID_PAYLOAD) });
      await app.request("/api/v1/ingest", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "2.2.2.2" }, body: JSON.stringify(VALID_PAYLOAD) });
      await app.request("/api/v1/ingest", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "3.3.3.3" }, body: JSON.stringify(VALID_PAYLOAD) });

      expect(globalLimiterStore.getSizes().ip).toBe(3);

      // 4th IP forces cardinality eviction (batch size = 10, so it will evict all 3 keys since total size is 3)
      await app.request("/api/v1/ingest", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "4.4.4.4" }, body: JSON.stringify(VALID_PAYLOAD) });

      const sizes = globalLimiterStore.getSizes();
      expect(sizes.ip).toBe(1); // 3 deleted, 1 inserted
      expect(globalLimiterStore.cardinalityEvictions).toBe(3);
    });

    it("should ensure active buckets survive eviction pressure (LRU ordering)", async () => {
      const maxBuckets = 15;
      const limit = 10;
      const windowMs = 60000;
      const burstMultiplier = 1.0;

      // 1. Fill the store to maxBuckets (15) with non-idle buckets
      for (let i = 1; i <= 15; i++) {
        // cost = limit ensures they have 0 tokens left (non-idle)
        await globalLimiterStore.consume("ip", `ip_${i}`, limit, windowMs, limit, burstMultiplier, maxBuckets);
      }

      expect(globalLimiterStore.getSizes().ip).toBe(15);

      // 2. Make ip_1 active again by consuming from it (updates lastAccessed and Map order)
      await globalLimiterStore.consume("ip", "ip_1", limit, windowMs, 0, burstMultiplier, maxBuckets);

      // 3. Consume a new IP which triggers eviction (maxBuckets exceeded)
      // Since maxBuckets = 15, and map has 15, adding a 16th key triggers eviction.
      // It will evict 10 keys.
      // Order of map keys before eviction: ip_2, ip_3, ..., ip_15, ip_1.
      // None of them are idle (they all have tokens < burstLimit).
      // So it will evict the first 10 keys: ip_2, ip_3, ip_4, ip_5, ip_6, ip_7, ip_8, ip_9, ip_10, ip_11.
      await globalLimiterStore.consume("ip", "ip_16", limit, windowMs, limit, burstMultiplier, maxBuckets);

      // 4. Verify sizes and survival
      const sizes = globalLimiterStore.getSizes();
      expect(sizes.ip).toBe(6); // 15 - 10 + 1 = 6

      // ip_1 must survive because it was active
      const ip1 = (globalLimiterStore as any).ipBuckets.get("ip_1");
      expect(ip1).toBeDefined();

      // ip_2 must be evicted
      const ip2 = (globalLimiterStore as any).ipBuckets.get("ip_2");
      expect(ip2).toBeUndefined();

      // ip_12 must survive
      const ip12 = (globalLimiterStore as any).ipBuckets.get("ip_12");
      expect(ip12).toBeDefined();
    });

    it("should prioritize eviction of idle buckets first, even if they are recently created", async () => {
      const maxBuckets = 12;
      const limit = 10;
      const windowMs = 60000;
      const burstMultiplier = 1.0;

      // 1. Create 11 non-idle buckets
      for (let i = 1; i <= 11; i++) {
        await globalLimiterStore.consume("ip", `ip_${i}`, limit, windowMs, limit, burstMultiplier, maxBuckets);
      }

      // 2. Create 1 idle bucket (ip_12) by consuming with cost = 0 (so it has full tokens)
      await globalLimiterStore.consume("ip", "ip_12", limit, windowMs, 0, burstMultiplier, maxBuckets);

      expect(globalLimiterStore.getSizes().ip).toBe(12);

      // 3. Add a 13th key (ip_13) to trigger eviction of 10 keys.
      // Insertion order: ip_1, ip_2, ..., ip_11 (all non-idle), ip_12 (idle).
      // Eviction logic should:
      // - First find idle buckets: ip_12 is idle, so it is selected.
      // - Then fallback to LRU non-idle: ip_1, ip_2, ..., ip_9.
      // - Total evicted: ip_12, ip_1, ip_2, ip_3, ip_4, ip_5, ip_6, ip_7, ip_8, ip_9.
      // - Surviving: ip_10, ip_11, ip_13.
      await globalLimiterStore.consume("ip", "ip_13", limit, windowMs, limit, burstMultiplier, maxBuckets);

      const sizes = globalLimiterStore.getSizes();
      expect(sizes.ip).toBe(3); // 12 - 10 + 1 = 3

      // ip_12 (idle but newest) must be evicted!
      expect((globalLimiterStore as any).ipBuckets.get("ip_12")).toBeUndefined();

      // ip_10 and ip_11 (older but non-idle) must survive!
      expect((globalLimiterStore as any).ipBuckets.get("ip_10")).toBeDefined();
      expect((globalLimiterStore as any).ipBuckets.get("ip_11")).toBeDefined();
      expect((globalLimiterStore as any).ipBuckets.get("ip_13")).toBeDefined();
    });

    it("should ensure limiter behavior remains deterministic and cardinality limits are enforced", async () => {
      const maxBuckets = 5;
      const limit = 10;
      const windowMs = 60000;
      const cost = 1;
      const burstMultiplier = 1.0;

      // Repeatedly consume keys to verify deterministic size bounds
      for (let i = 1; i <= 50; i++) {
        await globalLimiterStore.consume("ip", `ip_${i}`, limit, windowMs, cost, burstMultiplier, maxBuckets);
        const size = globalLimiterStore.getSizes().ip;
        expect(size).toBeLessThanOrEqual(maxBuckets);
      }
    });
  });

  // 5. Metrics Route Tests
  describe("Metrics Endpoint", () => {
    let originalNodeEnv: string | undefined;

    beforeAll(() => {
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterAll(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("should block metrics request with 403 by default", async () => {
      const res = await app.request("/metrics");
      expect(res.status).toBe(403);
    });

    describe("Development Environment", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "development";
        process.env.ENABLE_INTERNAL_METRICS = "true";
      });

      it("should return 200 without authentication", async () => {
        const res = await app.request("/metrics");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.metrics).toBeDefined();
      });
    });

    describe("Production Environment", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "production";
        process.env.ENABLE_INTERNAL_METRICS = "true";
      });

      it("should return 401 if token is not configured", async () => {
        const res = await app.request("/metrics");
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.message).toContain("INTERNAL_METRICS_TOKEN");
      });

      it("should return 401 for requests with invalid token", async () => {
        process.env.INTERNAL_METRICS_TOKEN = "secret_prod_token";
        const res = await app.request("/metrics", {
          headers: { Authorization: "Bearer wrong_token" },
        });
        expect(res.status).toBe(401);
      });

      it("should return 200 for requests with a valid token", async () => {
        process.env.INTERNAL_METRICS_TOKEN = "secret_prod_token";
        const res = await app.request("/metrics", {
          headers: { Authorization: "Bearer secret_prod_token" },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
      });
    });
  });

  // 6. Defensive Env Var Parsing and Multi-Tenant Session Isolation Tests
  describe("Defensive Parsing & Session Key Isolation", () => {
    it("should safely fall back to defaults when RPM or multiplier env vars are invalid (NaN, 0, negative)", () => {
      // Mock invalid environment variables
      process.env.INGEST_IP_RPM = "0";
      process.env.INGEST_PROJECT_RPM = "-50";
      process.env.INGEST_SESSION_RPM = "invalid-number";
      process.env.INGEST_BURST_MULTIPLIER = "-1.5";
      process.env.RATE_LIMIT_MAX_IP_BUCKETS = "abc";

      const config = getEnvConfig();

      expect(config.ipRpm).toBe(120);
      expect(config.projectRpm).toBe(500);
      expect(config.sessionRpm).toBe(30);
      expect(config.burstMultiplier).toBe(1.5);
      expect(config.maxIpBuckets).toBe(50000);
    });

    it("should isolate session rate limits by projectKey to prevent cross-tenant collision", async () => {
      process.env.INGEST_SESSION_RPM = "1";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // Request 1: Project A, Session X (Allowed)
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_proj_a", sessionId: "sess_shared" }),
      });
      expect(res.status).toBe(200);

      // Request 2: Project B, Session X (Allowed - different project isolation!)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_proj_b", sessionId: "sess_shared" }),
      });
      expect(res.status).toBe(200);

      // Request 3: Project A, Session X (Blocked - exceeded session limit for Project A)
      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_PAYLOAD, projectKey: "pk_proj_a", sessionId: "sess_shared" }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.reason).toBe("session");
    });
  });

  describe("Middleware Ordering & Optional Session ID", () => {
    it("should reject rate-limited IP with 429 before checking body limit (Middleware Ordering)", async () => {
      process.env.INGEST_IP_RPM = "1";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";

      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      // Request 1: Allowed
      let res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(res.status).toBe(200);

      // Request 2: Rate limited IP sending oversized payload
      const hugeBody = JSON.stringify({
        ...VALID_PAYLOAD,
        events: Array.from({ length: 1000 }).map(() => ({ data: "x".repeat(3000) })), // > 3MB
      });

      res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
        body: hugeBody,
      });

      // It must return 429 (IP limit) instead of 413 (Payload Too Large)
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.reason).toBe("ip");
    });

    it("should reject non-rate-limited request with 413 when body is oversized", async () => {
      process.env.INGEST_IP_RPM = "100";
      process.env.INGEST_BURST_MULTIPLIER = "1.0";

      const hugeBody = JSON.stringify({
        ...VALID_PAYLOAD,
        events: Array.from({ length: 1000 }).map(() => ({ data: "x".repeat(3000) })), // > 3MB
      });

      const res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "8.8.8.8" },
        body: hugeBody,
      });

      expect(res.status).toBe(413);
    });

    it("should execute project protections but skip session rate limiter and fail on schema validation when sessionId is missing", async () => {
      (pool.query as any).mockResolvedValue({ rows: [{ id: "proj_abc" }] });

      const payloadWithoutSession = { ...VALID_PAYLOAD };
      delete (payloadWithoutSession as any).sessionId;

      const res = await app.request("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadWithoutSession),
      });

      // Should fail schema validation with 400
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toBe("Validation Error");

      // Verify that project validation was still executed
      expect(pool.query).toHaveBeenCalledWith(
        "SELECT id FROM projects WHERE public_key = $1 AND is_active = true",
        [VALID_PAYLOAD.projectKey]
      );
    });
  });
});
