/**
 * @file triage-prompts.test.ts
 * @description Unit tests for the triage prompt builder.
 * @why Prompt structure directly affects LLM output quality. These tests verify that session metadata,
 *      timeline data, and candidate groups are correctly formatted into the XML prompt template.
 */

import { describe, it, expect } from "vitest";
import { buildTriagePrompt } from "../workers/triage-prompts";
import type { TriageContext } from "../workers/triage-types";
import type { SessionTimeline } from "../workers/triage/timeline";

// Minimal valid timeline for test fixtures
function makeTimeline(overrides: Partial<SessionTimeline> = {}): SessionTimeline {
  return {
    summary: "[0] page_view: /home",
    eventCount: 1,
    truncated: false,
    fingerprints: [],
    rawFingerprints: [],
    ...overrides,
  };
}

// Minimal valid context for test fixtures
function makeContext(overrides: Partial<TriageContext> = {}): TriageContext {
  return {
    session: {
      id: "sess_test123",
      url: "https://example.com/home",
      duration_ms: 5000,
      started_at: 1700000000000,
      release: "v1.2.3",
      commit_sha: "abc123",
      environment: "production",
    },
    timeline: makeTimeline(),
    candidate_issue_groups: [],
    ...overrides,
  };
}

describe("buildTriagePrompt", () => {
  it("should include session metadata in XML format", () => {
    const prompt = buildTriagePrompt(makeContext());

    expect(prompt).toContain("<session>");
    expect(prompt).toContain("<id>sess_test123</id>");
    expect(prompt).toContain("<url>https://example.com/home</url>");
    expect(prompt).toContain("<duration_ms>5000</duration_ms>");
    expect(prompt).toContain("<release>v1.2.3</release>");
    expect(prompt).toContain("<commit_sha>abc123</commit_sha>");
    expect(prompt).toContain("<environment>production</environment>");
    expect(prompt).toContain("</session>");
  });

  it("should include timeline summary in XML format", () => {
    const prompt = buildTriagePrompt(
      makeContext({
        timeline: makeTimeline({ summary: "[0] js_error: TypeError at line 42" }),
      })
    );

    expect(prompt).toContain("<session_timeline>");
    expect(prompt).toContain("js_error: TypeError at line 42");
    expect(prompt).toContain("</session_timeline>");
  });

  it("should include candidate issue groups when provided", () => {
    const context = makeContext({
      candidate_issue_groups: [
        {
          id: "igr_abc123",
          title: "Login button crash",
          fingerprint: "fp_hash_1",
          severity: "P1",
          lastSeenAt: 1700000000000,
        },
        {
          id: "igr_def456",
          title: "Cart timeout",
          fingerprint: "fp_hash_2",
          severity: "P2",
          lastSeenAt: 1699999000000,
        },
      ],
    });

    const prompt = buildTriagePrompt(context);

    expect(prompt).toContain("<candidate_issue_groups>");
    expect(prompt).toContain("<id>igr_abc123</id>");
    expect(prompt).toContain("<title>Login button crash</title>");
    expect(prompt).toContain("<id>igr_def456</id>");
    expect(prompt).toContain("<title>Cart timeout</title>");
    expect(prompt).toContain("</candidate_issue_groups>");
  });

  it("should show no_candidates_found when candidates list is empty", () => {
    const prompt = buildTriagePrompt(makeContext());
    expect(prompt).toContain("<no_candidates_found />");
  });

  it("should cap candidates at 10 even if more are provided", () => {
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      id: `igr_${i}`,
      title: `Issue ${i}`,
      fingerprint: `fp_${i}`,
      severity: "P2",
      lastSeenAt: 1700000000000,
    }));

    const prompt = buildTriagePrompt(makeContext({ candidate_issue_groups: candidates }));

    // Should include first 10
    expect(prompt).toContain("<id>igr_0</id>");
    expect(prompt).toContain("<id>igr_9</id>");
    // Should NOT include 11th+
    expect(prompt).not.toContain("<id>igr_10</id>");
    expect(prompt).not.toContain("<id>igr_14</id>");
  });

  it("should escape XML special characters in session fields", () => {
    const context = makeContext({
      session: {
        id: "sess_test",
        url: "https://example.com/page?a=1&b=2",
        duration_ms: 1000,
        started_at: 1700000000000,
        release: "<script>alert('xss')</script>",
        commit_sha: null,
        environment: null,
      },
    });

    const prompt = buildTriagePrompt(context);

    // & should be escaped
    expect(prompt).toContain("&amp;");
    // < and > in release should be escaped
    expect(prompt).toContain("&lt;script&gt;");
    expect(prompt).not.toContain("<script>");
  });

  it("should handle null optional fields gracefully", () => {
    const context = makeContext({
      session: {
        id: "sess_null_test",
        url: "https://example.com",
        duration_ms: null,
        started_at: 1700000000000,
        release: null,
        commit_sha: null,
        environment: null,
      },
    });

    const prompt = buildTriagePrompt(context);

    expect(prompt).toContain("<duration_ms>unknown</duration_ms>");
    expect(prompt).toContain("<release>unknown</release>");
    expect(prompt).toContain("<commit_sha>unknown</commit_sha>");
    expect(prompt).toContain("<environment>unknown</environment>");
  });

  it("should include strict JSON-only output constraint", () => {
    const prompt = buildTriagePrompt(makeContext());

    expect(prompt).toContain("Output ONLY the raw JSON string");
    expect(prompt).toContain("no markdown fences");
  });

  it("should include all expected issue_group_action values in the schema", () => {
    const prompt = buildTriagePrompt(makeContext());

    expect(prompt).toContain("create");
    expect(prompt).toContain("attach");
    expect(prompt).toContain("ignore");
  });

  it("should include task instructions for the model", () => {
    const prompt = buildTriagePrompt(makeContext());

    expect(prompt).toContain("Analyze the timeline for user friction");
    expect(prompt).toContain("severity");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("reproduction_steps");
    expect(prompt).toContain("evidence");
  });
});
