/**
 * @file repair-prompt.ts
 * @description Formats the LLM prompt for repairing or updating root cause analyses.
 * @why Guides the AI to refine diagnoses when more session data or errors are observed.
 */


/**
 * buildRepairPrompt
 * Formulates a prompt requesting the LLM to correct its previous invalid output
 * based on the validation error details and the strict JSON schema.
 *
 * @param invalidOutput The raw invalid string output returned by the LLM.
 * @param validationError The descriptive validation error message.
 * @returns The formatted prompt string.
 */
export function buildRepairPrompt(invalidOutput: string, validationError: string): string {
  // Enforce a hard limit constraint on the input content to prevent token bloat
  const slicedOutput = invalidOutput.slice(0, 4000);

  return `
You are an advanced AI Triage Worker. Your previous JSON output failed validation with the following error:
<validation_error>
${validationError}
</validation_error>

Here is the invalid response you provided (truncated if exceeding 4000 characters):
<invalid_output>
${slicedOutput}
</invalid_output>

Please correct the JSON response so that it strictly conforms to the required JSON schema, corrects any syntax/parsing issues, and meets all verification constraints.

Target JSON Schema Description:
{
  "session_summary": "string describing the user session (max 2000 characters)",
  "goal_completed": true | false,
  "friction_score": number (0 to 100),
  "confidence": number (0.0 to 1.0),
  "reasoning": "string explanation of the triage outcome (max 2000 characters)",
  "issue_detected": true | false,
  "issue_group_action": "create" | "attach" | "ignore",
  "issue_group_id": "string if duplicate issue group, or null",
  "issues": [
    {
      "title": "short title summarizing the issue (max 500 characters)",
      "root_cause": "detailed explanation of why this error occurred (max 2000 characters)",
      "suggested_fix": "suggested code/config change to resolve the issue (max 2000 characters)",
      "severity": "P0" | "P1" | "P2" | "P3",
      "confidence": number (0.0 to 1.0),
      "reproduction_steps": ["step 1", "step 2", ...],
      "evidence": [
        {
          "type": "js_error" | "network_error" | "rage_click" | etc.,
          "timestamp_ms": number,
          "detail": "short string describing this specific evidence piece (max 1000 characters)"
        }
      ]
    }
  ] | null
}

Constraints & Rules:
1. If "issue_detected" is false, "issue_group_action" MUST be "ignore", "issue_group_id" MUST be null, and "issues" MUST be null or omitted.
2. If "issue_detected" is true:
   - If "issue_group_action" is "attach", "issue_group_id" must be a non-empty string.
   - If "issue_group_action" is "create", "issue_group_id" must be null, and "issues" must be a non-empty array with at least one issue.
3. The root-level "confidence" and "reasoning" are REQUIRED fields.
4. Output ONLY the raw corrected JSON string (no markdown fences, no extra text). Do not write any conversational preamble or postscript.
`.trim();
}
