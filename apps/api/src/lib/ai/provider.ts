/**
 * @file provider.ts
 * @description Defines the provider-agnostic AIProvider interface, LLMResult type,
 *              and shared JSON extraction/validation utilities.
 * @why Decoupling the triage pipeline from any specific LLM vendor allows model swaps
 *      via configuration changes only. Providers do NOT handle retries — that responsibility
 *      stays with the triage runner/worker layer.
 */

import { AISchema, type AITriageOutput } from "../../workers/triage-service";

/**
 * LLMResult
 * Represents a successfully parsed and validated LLM response.
 * Includes the Zod-validated data, token usage metrics, and the model identifier.
 */
export interface LLMResult {
  data: AITriageOutput;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * AIProvider
 * Provider-agnostic interface for invoking an LLM with a text prompt.
 *
 * Contracts:
 * - Providers MUST NOT implement retry logic. Retries are managed externally by the triage runner.
 * - Providers MUST validate the raw LLM response structure before attempting JSON extraction.
 * - Providers MUST return a fully Zod-validated LLMResult or throw a descriptive error.
 * - Providers MUST NOT log prompt text, API keys, or user PII.
 */
export interface AIProvider {
  invoke(input: string): Promise<LLMResult>;
}

/**
 * extractAndValidateJSON
 * Provider-independent utility that extracts a JSON object from raw LLM text output
 * and validates it against the AISchema Zod schema.
 *
 * Extraction strategy (in order):
 * 1. Search for ```json ... ``` markdown code block wrappers and extract the inner content.
 * 2. Fallback: locate the first '{' and last '}' to isolate the JSON string.
 * 3. Parse the extracted string as JSON.
 * 4. Validate the parsed object against AISchema with strict mode.
 *
 * @param raw The raw text content from the LLM response.
 * @returns The Zod-validated AITriageOutput object.
 * @throws Error if JSON extraction, parsing, or schema validation fails.
 */
export function extractAndValidateJSON(raw: string): AITriageOutput {
  let jsonString = raw.trim();

  // Strategy 1: Extract from ```json ... ``` code blocks
  const jsonBlockMatch = jsonString.match(/```json([\s\S]*?)```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    jsonString = jsonBlockMatch[1].trim();
  } else {
    // Strategy 2: Fallback to brace extraction
    const firstBrace = jsonString.indexOf("{");
    const lastBrace = jsonString.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonString = jsonString.slice(firstBrace, lastBrace + 1);
    }
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (parseErr: any) {
    throw new (Error as any)(
      `Failed to parse LLM response as JSON: ${parseErr.message}. Raw text length: ${raw.length}`,
      { cause: parseErr }
    );
  }

  const zodResult = AISchema.safeParse(parsedJson);
  if (!zodResult.success) {
    throw new Error(
      `LLM JSON output did not conform to the schema: ${zodResult.error.message}`
    );
  }

  return zodResult.data;
}
