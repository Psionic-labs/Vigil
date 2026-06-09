/**
 * @file index.ts
 * @description Exports the selected AI provider instance configured for triaging.
 * @why Abstracts vendor-specific LLM details behind a clean, unified interface.
 */


export type { AIProvider, LLMResult } from "./provider";
export { extractAndValidateJSON, AIValidationError, getRawOutput } from "./provider";
export { OpenRouterProvider } from "./openrouter-provider";
export type { OpenRouterConfig } from "./openrouter-provider";
