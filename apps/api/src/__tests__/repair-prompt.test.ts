/**
 * @file repair-prompt.test.ts
 * @description Unit tests for the repair prompt builder.
 */

import { describe, it, expect } from "vitest";
import { buildRepairPrompt } from "../workers/triage/repair-prompt";

describe("buildRepairPrompt", () => {
  it("should contain the validation error in the output", () => {
    const errorMsg = "JSON schema validation failed: confidence is required";
    const prompt = buildRepairPrompt('{"foo": "bar"}', errorMsg);

    expect(prompt).toContain(errorMsg);
    expect(prompt).toContain("<validation_error>");
  });

  it("should contain the invalid output in the prompt content", () => {
    const invalidOutput = '{"session_summary": "Bad JSON",}';
    const prompt = buildRepairPrompt(invalidOutput, "Syntax error");

    expect(prompt).toContain(invalidOutput);
    expect(prompt).toContain("<invalid_output>");
  });

  it("should enforce the 4000 character limit by slicing the invalid output", () => {
    const longString = "A".repeat(5000);
    const prompt = buildRepairPrompt(longString, "Too long");

    expect(prompt).toContain("A".repeat(4000));
    expect(prompt).not.toContain("A".repeat(4001));
  });

  it("should instruct the model to output JSON only", () => {
    const prompt = buildRepairPrompt("{}", "Validation failure");

    expect(prompt).toContain("Output ONLY the raw corrected JSON string");
    expect(prompt).toContain("no markdown fences");
  });

  it("should include the required JSON schema description with confidence and reasoning", () => {
    const prompt = buildRepairPrompt("{}", "Validation failure");

    expect(prompt).toContain('"confidence": number (0.0 to 1.0)');
    expect(prompt).toContain('"reasoning": "string explanation of the triage outcome');
  });
});
