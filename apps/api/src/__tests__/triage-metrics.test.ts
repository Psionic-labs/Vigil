import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import app from "../app";
import { pool } from "../db";

// Mock the database interface to isolate metrics handler calculations.
// This prevents unit tests from requiring a running PostgreSQL server and allows mocking query outputs directly.
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

describe("AI Triage Queue Metrics Endpoint", () => {
  // Reset test configuration before each execution.
  beforeEach(() => {
    vi.clearAllMocks();
    // Configure environment to 'development' and enable metrics to bypass Bearer token authentication gates.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_INTERNAL_METRICS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Test Case 1: Empty Queue
  // Verifies that when triage_jobs is empty (all values returned from SQL COUNT/SUM are null or "0"),
  // the metrics endpoint successfully parses them into numeric zeros.
  it("should return zeros for all queue metrics if the queue is empty", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          queue_depth: "0",
          oldest_job_age_ms: "0",
          jobs_leased: "0",
          jobs_dead_letter: "0",
          jobs_retried: "0",
          jobs_completed: "0",
        },
      ],
    } as any);

    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("SUM(GREATEST(attempts - 1, 0))"),
      expect.any(Array)
    );

    expect(body.ok).toBe(true);
    // Assert flat keys are numeric zeros
    expect(body.metrics.triage_queue_depth).toBe(0);
    expect(body.metrics.triage_oldest_job_age_ms).toBe(0);
    expect(body.metrics.triage_jobs_leased).toBe(0);
    expect(body.metrics.triage_jobs_dead_letter).toBe(0);
    expect(body.metrics.triage_jobs_retried).toBe(0);
    expect(body.metrics.triage_jobs_completed).toBe(0);

    // Assert nested queue metrics block
    expect(body.metrics.queue).toEqual({
      depth: 0,
      oldestJobAgeMs: 0,
      leasedJobs: 0,
      deadLetterJobs: 0,
      retries: 0,
      completedJobs: 0,
    });
  });

  // Test Case 2: Mixed Queue States
  // Verifies that aggregated queue counts returned as string numbers from PostgreSQL (e.g. COUNT(*))
  // are parsed correctly by parseInt() and returned under both flat and nested JSON structures.
  it("should parse and return aggregated queue states correctly", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          queue_depth: "5",
          oldest_job_age_ms: "60000",
          jobs_leased: "2",
          jobs_dead_letter: "3",
          jobs_retried: "7",
          jobs_completed: "12",
        },
      ],
    } as any);

    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.ok).toBe(true);
    // Verify flat metrics parsing
    expect(body.metrics.triage_queue_depth).toBe(5);
    expect(body.metrics.triage_oldest_job_age_ms).toBe(60000);
    expect(body.metrics.triage_jobs_leased).toBe(2);
    expect(body.metrics.triage_jobs_dead_letter).toBe(3);
    expect(body.metrics.triage_jobs_retried).toBe(7);
    expect(body.metrics.triage_jobs_completed).toBe(12);

    // Verify nested queue object structure matches expectations
    expect(body.metrics.queue).toEqual({
      depth: 5,
      oldestJobAgeMs: 60000,
      leasedJobs: 2,
      deadLetterJobs: 3,
      retries: 7,
      completedJobs: 12,
    });
  });

  // Test Case 3: DB Query Failure
  // Verifies that a database connectivity/query outage is captured gracefully inside a try/catch block.
  // The metrics route must never crash, returning HTTP 200 with fallback zero values and logging the error to console.
  it("should handle database failures by logging them and returning zeroed metrics", async () => {
    // Spy on console.error to assert a warning log is recorded, while preventing it from cluttering the test logs.
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(pool.query).mockRejectedValueOnce(new Error("Database connection timeout"));

    const res = await app.request("/metrics");
    expect(res.status).toBe(200); // Must remain 200 to keep monitoring metrics alive
    const body = await res.json() as any;

    expect(body.ok).toBe(true);
    // All fallback queue values must be initialized to 0
    expect(body.metrics.triage_queue_depth).toBe(0);
    expect(body.metrics.triage_oldest_job_age_ms).toBe(0);
    expect(body.metrics.triage_jobs_leased).toBe(0);
    expect(body.metrics.triage_jobs_dead_letter).toBe(0);
    expect(body.metrics.triage_jobs_retried).toBe(0);
    expect(body.metrics.triage_jobs_completed).toBe(0);

    expect(body.metrics.queue).toEqual({
      depth: 0,
      oldestJobAgeMs: 0,
      leasedJobs: 0,
      deadLetterJobs: 0,
      retries: 0,
      completedJobs: 0,
    });

    // Check that the error log is printed with expected message contents
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Metrics] Failed to fetch triage queue metrics:"),
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  // Test Case 4: Enforce lease timeout parsing and query parameter delegation
  it("should parse TRIAGE_LEASE_TIMEOUT_MS and pass it to the SQL query parameter array", async () => {
    vi.stubEnv("TRIAGE_LEASE_TIMEOUT_MS", "600000"); // 10 minutes

    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          queue_depth: "0",
          oldest_job_age_ms: "0",
          jobs_leased: "0",
          jobs_dead_letter: "0",
          jobs_retried: "0",
          jobs_completed: "0",
        },
      ],
    } as any);

    const nowBefore = Date.now();
    const res = await app.request("/metrics");
    const nowAfter = Date.now();

    expect(res.status).toBe(200);

    // Verify parameters passed to pool.query
    const calls = vi.mocked(pool.query).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toBeDefined();
    const queryParams = (lastCall?.[1] ?? []) as any[];
    expect(queryParams).toBeDefined();
    expect(queryParams.length).toBe(4);

    const passedNow = queryParams[0];
    const passedMaxAttempts = queryParams[1];
    const passedStaleThreshold = queryParams[2];
    const passedOneDayAgo = queryParams[3];

    expect(passedNow).toBeGreaterThanOrEqual(nowBefore);
    expect(passedNow).toBeLessThanOrEqual(nowAfter);
    expect(passedMaxAttempts).toBe(3); // default max attempts

    // Stale threshold should be: now - 600000 (10 minutes)
    expect(passedStaleThreshold).toBe(passedNow - 600000);
    expect(passedOneDayAgo).toBe(passedNow - 24 * 60 * 60 * 1000);
  });
});
