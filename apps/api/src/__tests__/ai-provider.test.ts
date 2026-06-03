/**
 * @file ai-provider.test.ts
 * @description Unit tests for the extractAndValidateJSON utility and OpenRouterProvider.
 * @why Validates that JSON extraction handles all LLM output formats (raw, code-fenced, surrounded by prose),
 *      and that the OpenRouter provider correctly validates response structure before parsing.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { extractAndValidateJSON } from "../lib/ai/provider";
import { OpenRouterProvider } from "../lib/ai/openrouter-provider";

// Shared valid triage output for reuse
const validTriageOutput = {
  session_summary: "User encountered checkout error.",
  goal_completed: false,
  friction_score: 95,
  confidence: 0.9,
  reasoning: "Multiple checkout crash errors identified.",
  issue_detected: true,
  issue_group_action: "new issue group",
  issue_group_id: null,
  issues: [
    {
      title: "Payment fail 500",
      root_cause: "POST /api/pay returned 500",
      suggested_fix: "Fix pay endpoint",
      severity: "P0",
      confidence: 0.95,
      reproduction_steps: ["Go to check out", "Click pay"],
      evidence: [
        {
          type: "network_error",
          timestamp_ms: 100,
          detail: "500 error",
        },
      ],
    },
  ],
};

// --- extractAndValidateJSON ---

describe("extractAndValidateJSON", () => {
  it("should parse raw JSON string", () => {
    const result = extractAndValidateJSON(JSON.stringify(validTriageOutput));
    expect(result).toEqual(validTriageOutput);
  });

  it("should extract JSON from ```json code blocks", () => {
    const wrapped = `Here is the analysis:\n\`\`\`json\n${JSON.stringify(validTriageOutput)}\n\`\`\``;
    const result = extractAndValidateJSON(wrapped);
    expect(result).toEqual(validTriageOutput);
  });

  it("should extract JSON using brace fallback when no code block", () => {
    const surrounded = `Here is the result: ${JSON.stringify(validTriageOutput)} That's the output.`;
    const result = extractAndValidateJSON(surrounded);
    expect(result).toEqual(validTriageOutput);
  });

  it("should throw on non-JSON text", () => {
    expect(() => extractAndValidateJSON("This is not JSON at all")).toThrow(
      /Failed to parse LLM response as JSON/
    );
  });

  it("should throw on valid JSON that violates schema", () => {
    const invalidData = {
      session_summary: "Bad data",
      friction_score: 200,
      issue_detected: false,
    };
    expect(() => extractAndValidateJSON(JSON.stringify(invalidData))).toThrow(
      /LLM JSON output did not conform to the schema/
    );
  });

  it("should handle JSON with leading/trailing whitespace", () => {
    const padded = `   \n  ${JSON.stringify(validTriageOutput)}  \n   `;
    const result = extractAndValidateJSON(padded);
    expect(result).toEqual(validTriageOutput);
  });
});

// --- OpenRouterProvider ---

describe("OpenRouterProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw if apiKey is missing", () => {
    expect(() => new OpenRouterProvider({ apiKey: "", model: "test" })).toThrow(
      /requires an API key/
    );
  });

  it("should throw if model is missing", () => {
    expect(() => new OpenRouterProvider({ apiKey: "key", model: "" })).toThrow(
      /requires a model identifier/
    );
  });

  it("should invoke and parse a valid OpenRouter response", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(validTriageOutput),
            },
          },
        ],
        usage: { prompt_tokens: 150, completion_tokens: 75 },
        model: "openrouter/owl-alpha",
      }),
    } as any);

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/owl-alpha",
    });

    const result = await provider.invoke("Test prompt");

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.rawContent).toBe(JSON.stringify(validTriageOutput));
    expect(result.model).toBe("openrouter/owl-alpha");
    expect(result.input_tokens).toBe(150);
    expect(result.output_tokens).toBe(75);

    // Verify request structure
    const callArgs = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(callArgs[1]!.body as string);
    expect(body.model).toBe("openrouter/owl-alpha");
    expect(body.temperature).toBe(0);
    expect(body.messages[0].content).toBe("Test prompt");
  });

  it("should throw on HTTP error responses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    } as any);

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/owl-alpha",
    });

    await expect(provider.invoke("Test prompt")).rejects.toThrow(
      /OpenRouter API request failed with status 429/
    );
  });

  it("should throw on missing choices array", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        usage: { prompt_tokens: 100 },
      }),
    } as any);

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/owl-alpha",
    });

    await expect(provider.invoke("Test prompt")).rejects.toThrow(
      /missing or empty 'choices' array/
    );
  });

  it("should throw on empty choices array", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [],
      }),
    } as any);

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/owl-alpha",
    });

    await expect(provider.invoke("Test prompt")).rejects.toThrow(
      /missing or empty 'choices' array/
    );
  });

  it("should throw on missing message content", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" } }],
      }),
    } as any);

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/owl-alpha",
    });

    await expect(provider.invoke("Test prompt")).rejects.toThrow(
      /content.*empty or not a string/
    );
  });

  it("should throw on missing message object", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: "stop" }],
      }),
    } as any);

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/owl-alpha",
    });

    await expect(provider.invoke("Test prompt")).rejects.toThrow(
      /message.*missing/
    );
  });

  it("should use configured model as fallback when response lacks model field", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(validTriageOutput),
            },
          },
        ],
        // No model or usage fields
      }),
    } as any);

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/owl-alpha",
    });

    const result = await provider.invoke("Test prompt");
    expect(result.model).toBe("openrouter/owl-alpha");
    expect(result.input_tokens).toBeUndefined();
    expect(result.output_tokens).toBeUndefined();
  });
});
