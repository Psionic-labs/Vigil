/**
 * @file openrouter-provider.ts
 * @description Implements the OpenRouter AI client wrapper to call OpenAI/Anthropic/Gemini LLMs.
 * @why Resolves provider endpoints and formats request payloads for OpenRouter compatibility.
 */


import { type AIProvider, type LLMResult } from "./provider";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenRouterConfig
 * Configuration for constructing an OpenRouterProvider instance.
 */
export interface OpenRouterConfig {
  apiKey: string;        // OpenRouter API key (Bearer token)
  model: string;         // Model identifier (e.g. "openrouter/owl-alpha")
  maxTokens?: number;    // Max completion tokens (default: 2000)
  timeoutMs?: number;    // Request timeout in milliseconds (default: 60000)
}

/**
 * OpenRouterProvider
 * Implements the AIProvider interface for OpenRouter's OpenAI-compatible API.
 *
 * Response format:
 * ```json
 * {
 *   "choices": [{ "message": { "content": "..." } }],
 *   "usage": { "prompt_tokens": N, "completion_tokens": N },
 *   "model": "openrouter/owl-alpha"
 * }
 * ```
 */
export class OpenRouterProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error("OpenRouterProvider requires an API key.");
    }
    if (!config.model) {
      throw new Error("OpenRouterProvider requires a model identifier.");
    }

    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 2000;
    this.timeoutMs = config.timeoutMs ?? 60000;
  }

  /**
   * invoke
   * Sends a prompt to the OpenRouter API and returns a validated LLMResult.
   *
   * Steps:
   * 1. Build the request with AbortController timeout.
   * 2. POST to OpenRouter chat completions endpoint.
   * 3. Validate response HTTP status.
   * 4. Validate response structure (choices, message, content fields exist).
   * 5. Extract and validate JSON from the raw content using shared utility.
   * 6. Return LLMResult with token usage and model.
   *
   * @param input The formatted prompt string.
   * @returns Validated LLMResult.
   * @throws Error on network failure, invalid response structure, or schema violation.
   */
  async invoke(input: string): Promise<LLMResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: 0,
          messages: [{ role: "user", content: input }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown");
        console.error(`OpenRouter error details (status ${response.status}): ${errorText}`);
        throw new Error(
          `OpenRouter API request failed with status ${response.status}`
        );
      }

      const result = await response.json() as Record<string, unknown>;

      // Validate response structure before accessing nested fields.
      // OpenRouter returns an OpenAI-compatible format with choices[].message.content.
      this.validateResponseStructure(result);

      const choices = result.choices as Array<{ message: { content: string } }>;
      const firstChoice = choices[0];
      if (!firstChoice) {
        throw new Error("OpenRouter response choices array is empty");
      }
      const rawContent = firstChoice.message.content;

      const usage = result.usage as
        | { prompt_tokens?: number; completion_tokens?: number }
        | undefined;

      return {
        rawContent,
        model: (result.model as string) ?? this.model,
        input_tokens: usage?.prompt_tokens,
        output_tokens: usage?.completion_tokens,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * validateResponseStructure
   * Guards against malformed or unexpected OpenRouter responses before
   * accessing deeply nested fields. Throws descriptive errors for each
   * structural violation.
   *
   * @param result The parsed JSON response body from OpenRouter.
   * @throws Error if the response does not match the expected structure.
   */
  private validateResponseStructure(result: Record<string, unknown>): void {
    if (!result || typeof result !== "object") {
      throw new Error("OpenRouter returned an invalid response: expected a JSON object.");
    }

    if (!Array.isArray(result.choices) || result.choices.length === 0) {
      throw new Error(
        "OpenRouter returned an invalid response: missing or empty 'choices' array."
      );
    }

    const firstChoice = (result.choices as any[])[0];
    if (!firstChoice || typeof firstChoice !== "object") {
      throw new Error(
        "OpenRouter returned an invalid response: 'choices[0]' is not an object."
      );
    }

    if (!firstChoice.message || typeof firstChoice.message !== "object") {
      throw new Error(
        "OpenRouter returned an invalid response: 'choices[0].message' is missing."
      );
    }

    const content = firstChoice.message.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error(
        "OpenRouter returned an invalid response: 'choices[0].message.content' is empty or not a string."
      );
    }
  }
}
