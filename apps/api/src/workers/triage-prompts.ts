/**
 * @file triage-prompts.ts
 * @description Compiles session telemetry records, events timelines, and existing issue candidates into a structured prompt.
 * @why Formatting telemetry inside XML container tags enables LLMs (like Claude 3) to accurately parse structured data,
 *      improving reasoning performance for duplicate identification and triage categorization.
 */

import type { TriageContext } from "./triage-types";

/**
 * buildTriagePrompt
 * Builds the prompt template for the AI triage task.
 *
 * @param context The aggregated TriageContext containing the session metadata, timeline events, and open candidate issue groups.
 * @returns A fully formulated string prompt ready to be sent to the Anthropic API.
 *
 * How it works:
 * 1. Formats the session properties (id, url, release, environment, etc.) into a `<session>` XML block.
 * 2. Serializes the timeline array (up to 100 events) chronologically into individual `<event>` XML blocks.
 * 3. Serializes the open candidate issue groups matching by fingerprint into `<issue_group>` blocks.
 * 4. Appends system instructions directing Claude to assess user friction, perform fingerprint deduplication,
 *    determine severity/confidence, and generate detailed reproduction steps.
 * 5. Specifies the strict JSON schema matching AISchema for the model to output.
 */
export function buildTriagePrompt(context: TriageContext): string {
  const { session, timeline, candidate_issue_groups: candidates } = context;

  // Format session metadata into XML tags
  const sessionXml = `
<session>
  <id>${session.id}</id>
  <url>${session.url}</url>
  <duration_ms>${session.duration_ms ?? "unknown"}</duration_ms>
  <started_at>${session.started_at}</started_at>
  <release>${session.release ?? "unknown"}</release>
  <commit_sha>${session.commit_sha ?? "unknown"}</commit_sha>
  <environment>${session.environment ?? "unknown"}</environment>
</session>
`.trim();

  // Format timeline events chronologically into index-keyed event tags
  const timelineEventsXml = timeline
    .map((event, idx) => {
      const parts = [
        `  <event index="${idx}">`,
        `    <type>${event.type}</type>`,
        `    <timestamp_ms>${event.timestamp_ms}</timestamp_ms>`,
      ];

      if (event.target) parts.push(`    <target>${String(event.target)}</target>`);
      if (event.error_message) parts.push(`    <error_message>${event.error_message}</error_message>`);
      if (event.error_stack) parts.push(`    <error_stack>${event.error_stack}</error_stack>`);
      if (event.network_url) parts.push(`    <network_url>${event.network_url}</network_url>`);
      if (event.network_status !== undefined && event.network_status !== null) {
        parts.push(`    <network_status>${event.network_status}</network_status>`);
      }
      if (event.network_method) parts.push(`    <network_method>${event.network_method}</network_method>`);
      if (event.click_count !== undefined && event.click_count !== null) {
        parts.push(`    <click_count>${event.click_count}</click_count>`);
      }
      if (event.nav_to) parts.push(`    <nav_to>${event.nav_to}</nav_to>`);
      if (event.fingerprint) parts.push(`    <fingerprint>${event.fingerprint}</fingerprint>`);

      parts.push("  </event>");
      return parts.join("\n");
    })
    .join("\n");

  const timelineXml = `<timeline>\n${timelineEventsXml}\n</timeline>`;

  // Format candidate issue groups to match fingerprints
  const candidatesXml = candidates.length > 0
    ? candidates
        .map((group) => {
          return `
  <issue_group>
    <id>${group.id}</id>
    <title>${group.title}</title>
    <fingerprint>${group.fingerprint}</fingerprint>
    <severity>${group.severity}</severity>
    <status>${group.status}</status>
    <last_seen_at>${group.last_seen_at}</last_seen_at>
  </issue_group>
`.trim();
        })
        .join("\n")
    : "  <no_candidates_found />";

  const candidatesContainerXml = `<candidate_issue_groups>\n${candidatesXml}\n</candidate_issue_groups>`;

  return `
You are an advanced AI Triage Worker. Your job is to analyze web application session telemetry and categorize the session.

Here is the session metadata:
${sessionXml}

Here is the timeline of events (ordered chronologically):
${timelineXml}

Here are the candidate issue groups for this project that match the fingerprints of the events in this session:
${candidatesContainerXml}

Task Instructions:
1. Analyze the timeline for user friction (JS errors, network request failures, rage clicks, dead clicks).
2. If there are no actual bugs or issues in this session (e.g. only normal navigation, or expected/benign network requests, or no errors at all), set "issue_detected" to false and "issue_group_action" to "skipped/noise".
3. If you detect an actual issue, try to see if it matches any of the candidate issue groups provided above based on matching fingerprint and symptoms:
   - If it matches a candidate issue group, set "issue_detected" to true, "issue_group_action" to "duplicate issue group", and set "issue_group_id" to the matching candidate's id.
   - If it does NOT match any existing candidate issue groups, set "issue_detected" to true, "issue_group_action" to "new issue group", leave "issue_group_id" null, and fill in the "issues" array with a detailed description of the new issue to create.
4. Populate "session_summary", "goal_completed" (whether the user successfully completed their path without being blocked), and "friction_score" (0 to 100).
5. For any issue you report or attach to, determine:
   - "severity": P0 (blocker/outage), P1 (major feature broken), P2 (minor issue/workaround), P3 (aesthetic/console notice).
   - "confidence": confidence level between 0.0 and 1.0.
   - "reproduction_steps": step-by-step reproduction instructions derived from the timeline.
   - "evidence": specific events from the timeline that prove this issue occurred.

You must output strictly valid JSON matching the following schema. Do not include any explanations, markdown code blocks, or additional text.

\`\`\`json
{
  "session_summary": "string describing the user session",
  "goal_completed": true | false,
  "friction_score": number (0 to 100),
  "issue_detected": true | false,
  "issue_group_action": "skipped/noise" | "duplicate issue group" | "new issue group",
  "issue_group_id": "string if duplicate issue group, or null",
  "issues": [
    {
      "title": "short title summarizing the issue",
      "root_cause": "detailed explanation of why this error occurred",
      "suggested_fix": "suggested code/config change to resolve the issue",
      "severity": "P0" | "P1" | "P2" | "P3",
      "confidence": number (0.0 to 1.0),
      "reproduction_steps": ["step 1", "step 2", ...],
      "evidence": [
        {
          "type": "js_error" | "network_error" | "rage_click" | etc.,
          "timestamp_ms": number,
          "detail": "short string describing this specific evidence piece"
        }
      ]
    }
  ]
}
\`\`\`

Strict Constraint:
Output ONLY the raw JSON string (no markdown fences, no extra text).
`.trim();
}
