/**
 * @file timeline.test.ts
 * @description Unit tests verifying relative formatting, filtering, priority compression, and safety truncation of the Session Timeline Builder.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "../db";
import { buildSessionTimeline } from "../workers/triage/timeline";

vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe("Session Timeline Builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test empty session scenario
  it("should handle empty session events list", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    const result = await buildSessionTimeline("sess_empty");
    expect(result.summary).toBe("No significant user activity recorded.");
    expect(result.eventCount).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.fingerprints).toEqual([]);
  });

  // Test chronological format and relative elapsed timestamps
  it("should build relative MM:SS timelines in chronological order", async () => {
    const mockEvents = [
      { type: "page_view", timestamp_ms: 1000, nav_to: "/home" },
      { type: "click", timestamp_ms: 5000, target: "button#login" },
      { type: "js_error", timestamp_ms: 9000, error_message: "TypeError", error_stack: "at login" },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_ok");
    expect(result.eventCount).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.summary).toContain("00:00 Page View: /home");
    expect(result.summary).toContain("00:04 Click: button#login");
    expect(result.summary).toContain("00:08 JS Error: TypeError\nStack: at login");
  });

  // Test event filter selecting prioritized events and ignoring noise
  it("should filter out low-signal noise events", async () => {
    const mockEvents = [
      { type: "page_view", timestamp_ms: 1000, nav_to: "/home" },
      { type: "mousemove", timestamp_ms: 2000 },
      { type: "scroll", timestamp_ms: 3000 },
      { type: "hover", timestamp_ms: 4000 },
      { type: "click", timestamp_ms: 5000, target: "button" },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_noise");
    expect(result.eventCount).toBe(2);
    expect(result.summary).not.toContain("mousemove");
    expect(result.summary).not.toContain("scroll");
    expect(result.summary).not.toContain("hover");
    expect(result.summary).toContain("00:00 Page View: /home");
    expect(result.summary).toContain("00:04 Click: button");
  });

  // Test fingerprint collection and deduplication
  it("should extract and deduplicate fingerprints", async () => {
    const mockEvents = [
      { type: "js_error", timestamp_ms: 1000, error_message: "E1", fingerprint: "fp1" },
      { type: "network_error", timestamp_ms: 2000, network_url: "api", fingerprint: "fp2" },
      { type: "js_error", timestamp_ms: 3000, error_message: "E1", fingerprint: "fp1" },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_fp");
    expect(result.fingerprints).toEqual(["fp1", "fp2"]);
    expect(result.rawFingerprints).toEqual(["fp1", "fp2", "fp1"]);
  });

  // Test priority based truncation
  it("should truncate timeline if exceeding limits but preserve errors and frustrations", async () => {
    const mockEvents: any[] = [];
    // Generate 55 clicks (low priority)
    for (let i = 0; i < 55; i++) {
      mockEvents.push({ type: "click", timestamp_ms: 1000 + i * 1000, target: `btn_${i}` });
    }
    // Append 5 JS errors (high priority)
    for (let i = 0; i < 5; i++) {
      mockEvents.push({ type: "js_error", timestamp_ms: 60000 + i * 1000, error_message: `Err_${i}`, fingerprint: `fp_${i}` });
    }

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_overflow");
    expect(result.eventCount).toBeLessThanOrEqual(50);
    expect(result.truncated).toBe(true);

    // Verify all 5 JS errors survived because they are high priority
    for (let i = 0; i < 5; i++) {
      expect(result.summary).toContain(`Err_${i}`);
    }
  });

  // Test timeline output limits character safety truncation
  it("should truncate long summaries to 4000 characters cleanly", async () => {
    const mockEvents: any[] = [];
    // Add one massive error event
    mockEvents.push({
      type: "js_error",
      timestamp_ms: 1000,
      error_message: "A".repeat(5000),
      error_stack: "B".repeat(5000)
    });

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_massive");
    expect(result.summary.length).toBeLessThanOrEqual(4000);
    expect(result.truncated).toBe(true);
    expect(result.summary.endsWith("...")).toBe(true);
  });

  // Test preserving error/frustration events at the event level during compression
  it("should preserve error/frustration events during compression by dropping whole events from the end", async () => {
    const mockEvents: any[] = [];
    // Create 15 high-priority events, each formatted to be ~350 characters, total ~5250 characters
    for (let i = 0; i < 15; i++) {
      mockEvents.push({
        type: "js_error",
        timestamp_ms: 1000 + i * 1000,
        error_message: `Err_${i}_` + "A".repeat(100),
        error_stack: "Stack_" + "B".repeat(200),
        fingerprint: `fp_${i}`
      });
    }

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_compression_preserve");
    expect(result.summary.length).toBeLessThanOrEqual(4000);
    expect(result.truncated).toBe(true);
    expect(result.summary.endsWith("...")).toBe(true);

    // Verify first and last errors are preserved
    expect(result.summary).toContain("Err_0_");
    expect(result.summary).toContain("Err_14_");

    const lines = result.summary.split("\n");
    expect(lines[lines.length - 1]).toBe("...");
    expect(result.eventCount).toBeLessThan(15);
    expect(result.eventCount).toBeGreaterThan(0);
  });

  // Test deterministic ordering query and sorting
  it("should query and return deterministic ordering for retained events", async () => {
    const mockEvents = [
      { type: "click", timestamp_ms: 1000, target: "btn1", id: "evt_b" },
      { type: "click", timestamp_ms: 1000, target: "btn2", id: "evt_a" },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    await buildSessionTimeline("sess_det");

    // Verify the query was made with ORDER BY timestamp_ms ASC, id ASC
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY timestamp_ms ASC, id ASC"),
      ["sess_det"]
    );
  });

  // Test Case: verify that network error status 0 is correctly kept in output
  it("should format network error with status 0 correctly in timeline summary", async () => {
    const mockEvents = [
      { type: "network_error", timestamp_ms: 1000, network_url: "http://api/data", network_method: "POST", network_status: 0 },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_net_zero");
    expect(result.summary).toContain("00:00 Network Error: POST http://api/data (Status: 0)");
  });

  // Test Case: verify fingerprint collection only from error/friction event types
  it("should only extract fingerprints from error/friction-bearing events", async () => {
    const mockEvents = [
      { type: "js_error", timestamp_ms: 1000, error_message: "E1", fingerprint: "fp_js" },
      { type: "click", timestamp_ms: 2000, target: "btn1", fingerprint: "fp_click" },
      { type: "rage_click", timestamp_ms: 2500, click_count: 5, fingerprint: "fp_rage" },
      { type: "network_error", timestamp_ms: 3000, network_url: "api", fingerprint: "fp_net" },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_fp_filter");
    expect(result.fingerprints).toEqual(["fp_js", "fp_rage", "fp_net"]);
    expect(result.rawFingerprints).toEqual(["fp_js", "fp_rage", "fp_net"]);
  });

  // Test Case: verify that naturally occurring ellipsis in event fields does not trigger timeline-level truncation
  it("should not mark timeline as truncated if an event naturally ends with ellipsis without compression or field truncation", async () => {
    const mockEvents = [
      { type: "click", timestamp_ms: 1000, target: "Click...", fingerprint: null },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockEvents } as any);

    const result = await buildSessionTimeline("sess_natural_ellipsis");
    expect(result.summary.endsWith("...")).toBe(true);
    expect(result.truncated).toBe(false); // No event dropped, no field truncated by our code
  });
});
