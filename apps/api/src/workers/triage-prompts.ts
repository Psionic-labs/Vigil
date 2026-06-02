import type { TriageContext } from "./triage-types";

/**
 * escapeXml

 * Escapes characters that are special in XML/HTML to prevent structure breakages and prompt injections.
 * Also supports optional truncation to keep the total prompt size within Anthropic message limits.
 *
 * @param unsafe The raw value to be escaped (string, number, or other).
 * @param maxLen Optional maximum character length boundary to truncate at.
 * @returns The escaped and potentially truncated safe string.
 */
function escapeXml(unsafe: any, maxLen?: number): string {
  if (unsafe === null || unsafe === undefined) {
    return "";
  }
  let str = String(unsafe);
  if (maxLen && str.length > maxLen) {
    str = str.substring(0, maxLen) + "... [truncated]";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

  // Format session metadata into XML tags, using escapeXml for safe interpolation.
  const sessionXml = `
<session>
  <id>${escapeXml(session.id)}</id>
  <url>${escapeXml(session.url)}</url>
  <duration_ms>${session.duration_ms !== null && session.duration_ms !== undefined ? session.duration_ms : "unknown"}</duration_ms>
  <started_at>${session.started_at}</started_at>
  <release>${escapeXml(session.release ?? "unknown")}</release>
  <commit_sha>${escapeXml(session.commit_sha ?? "unknown")}</commit_sha>
  <environment>${escapeXml(session.environment ?? "unknown")}</environment>
</session>
`.trim();

  // Format session-timeline into XML tags, using escapeXml for security.
  const timelineXml = `
<session_timeline>
${escapeXml(timeline.summary)}
</session_timeline>
`.trim();

  // Format candidate issue groups to match fingerprints, capped to 10 to protect prompt tokens budget.
  const cappedCandidates = candidates.slice(0, 10);
  const candidatesXml = cappedCandidates.length > 0
    ? cappedCandidates
        .map((group) => {
          return `
  <issue_group>
    <id>${escapeXml(group.id)}</id>
    <title>${escapeXml(group.title, 500)}</title>
    <fingerprint>${escapeXml(group.fingerprint)}</fingerprint>
    <severity>${escapeXml(group.severity)}</severity>
    <last_seen_at>${group.lastSeenAt}</last_seen_at>
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
