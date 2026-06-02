/**
 * @file triage-service.ts
 * @description Provides the Anthropic API client interface and strict Zod validation parsing logic.
 * @why Invoking LLMs is an untrusted operation. Using Zod guarantees type-safety and field value bounds on model outputs
 *      before attempting database writes. Capping network calls with timeouts protects worker event loops.
 */

import { z } from "zod";

// Zod Validation Schema for strict output parsing.
// Enforces types, string lengths, ranges, and structures for the AI triage findings.
export const AISchema = z.object({
  session_summary: z.string().max(2000),      // Summarized description of the user's session
  goal_completed: z.boolean(),                 // Flag stating if user accomplished their task
  friction_score: z.number().int().min(0).max(100), // Score representing estimated frustration levels (0-100)
  issue_detected: z.boolean(),                 // Flag stating if a real bug/issue is identified
  issue_group_action: z.enum(["skipped/noise", "duplicate issue group", "new issue group"]), // Categorization decision
  issue_group_id: z.string().max(255).optional().nullable(), // Target issue group to attach if duplicate
  issues: z.array(
    z.object({
      title: z.string().max(500),              // Summarized title of the issue
      root_cause: z.string().max(2000),        // In-depth telemetry root cause analysis
      suggested_fix: z.string().max(2000),     // Suggested actionable fix steps
      severity: z.enum(["P0", "P1", "P2", "P3"]), // Priority classification
      confidence: z.number().min(0).max(1),    // Level of certainty of the classification (0-1)
      reproduction_steps: z.array(z.string().max(1000)).max(20), // Steps to reproduce
      evidence: z.array(
        z.object({
          type: z.string().max(100),           // Evidence source type (e.g. 'js_error')
          timestamp_ms: z.number().int().nonnegative(), // Evidence event timestamp
          detail: z.string().max(1000),        // Specific telemetry log snippet
        })
      ).max(50),
    })
  ).max(5).optional().nullable(),
}).strict().refine((data) => {
  // Refinement Check: enforces logical consistency.
  if (!data.issue_detected) {
    // If no issue is detected, action must be skipped/noise and no group ID or issues should be provided.
    if (data.issue_group_action !== "skipped/noise") return false;
    if (data.issue_group_id) return false;
    if (data.issues && data.issues.length > 0) return false;
  } else {
    // If an issue is detected, action cannot be skipped/noise
    if (data.issue_group_action === "skipped/noise") return false;

    if (data.issue_group_action === "duplicate issue group") {
      // Must have a target issue_group_id
      if (!data.issue_group_id) return false;
    } else if (data.issue_group_action === "new issue group") {
      // Cannot have issue_group_id, and must have at least one issue detail
      if (data.issue_group_id) return false;
      if (!data.issues || data.issues.length === 0) return false;
    }
  }
  return true;
}, {
  message: "Inconsistent combination of issue_detected, issue_group_action, issue_group_id, and issues",
  path: ["issue_group_action"]
});

export type AITriageOutput = z.infer<typeof AISchema>;

/**
 * LLMResult
 * Represents a successfully parsed outcome containing data matching AISchema and model token usage.
 */
export interface LLMResult {
  data: AITriageOutput;
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * invokeModel
 * Invokes the Anthropic API via node fetch to request a session triage.
 *
 * @param model Model identifier to target (e.g. 'claude-3-haiku-20240307')
 * @param prompt XML-formatted prompt built by buildTriagePrompt
 * @param options Configurations including ANTHROPIC_API_KEY and request timeout override
 * @returns LLMResult including parsed Zod data structure and usage token counts.
 *
 * How it works:
 * 1. Abort timeout check: wraps request in AbortController with target timeout (default 60s) to avoid connection lockup.
 * 2. API Communication: sends POST to Anthropic messages endpoint.
 * 3. Text Extraction: extracts text block from response content.
 * 4. JSON Sanitization: searches for ```json markdown wrappers or fallback curly braces to isolate the JSON string.
 * 5. Zod Safe Parse: safe parses JSON. If invalid, throws parse/schema errors (triggering backoff retry).
 */
export async function invokeModel(
  model: string,
  prompt: string,
  options: { apiKey?: string; timeoutMs?: number } = {}
): Promise<LLMResult> {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured in the environment.");
  }

  const timeoutMs = options.timeoutMs || 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      throw new Error(`Anthropic API request failed with status ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as any;
    const textContent = result.content?.[0]?.text;

    if (!textContent) {
      throw new Error("Received empty response content from Anthropic API.");
    }

    // Extract JSON block if wrapped in ```json ... ``` code blocks
    let jsonString = textContent.trim();
    const jsonBlockMatch = jsonString.match(/```json([\s\S]*?)```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      jsonString = jsonBlockMatch[1].trim();
    } else {
      // Fallback: search for first '{' and last '}'
      const firstBrace = jsonString.indexOf("{");
      const lastBrace = jsonString.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonString = jsonString.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch (parseErr: any) {
      // Cast constructor to any to preserve compatibility with typescript target ES2020 while keeping cause details.
      throw new (Error as any)(`Failed to parse LLM response as JSON: ${parseErr.message}. Raw text: ${textContent}`, { cause: parseErr });
    }

    const zodResult = AISchema.safeParse(parsedJson);
    if (!zodResult.success) {
      throw new Error(
        `LLM JSON output did not conform to the schema: ${zodResult.error.message}. Raw JSON: ${jsonString}`
      );
    }

    return {
      data: zodResult.data,
      input_tokens: result.usage?.input_tokens,
      output_tokens: result.usage?.output_tokens,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
