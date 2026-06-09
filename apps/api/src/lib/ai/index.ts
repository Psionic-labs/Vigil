/**
 * @file index.ts
 * @description Barrel exports for the provider-agnostic AI module.
 */

export type { AIProvider, LLMResult } from "./provider";
export { extractAndValidateJSON, AIValidationError, getRawOutput } from "./provider";
export { OpenRouterProvider } from "./openrouter-provider";
export type { OpenRouterConfig } from "./openrouter-provider";
