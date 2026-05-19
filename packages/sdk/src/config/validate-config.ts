import type { NormalizedVigilOptions } from "../types";
import { DEFAULT_CONFIG } from "./defaults";

export function validateConfig(config: NormalizedVigilOptions): boolean {
  if (!config.projectKey || typeof config.projectKey !== "string") {
    console.error("Vigil SDK: Invalid or missing projectKey.");
    return false;
  }

  // Fallback invalid sample rates
  if (typeof config.sessionSampleRate !== "number" || config.sessionSampleRate < 0 || config.sessionSampleRate > 1) {
    if (config.debug) console.warn(`Vigil SDK: Invalid sessionSampleRate (${config.sessionSampleRate}). Falling back to ${DEFAULT_CONFIG.sessionSampleRate}.`);
    config.sessionSampleRate = DEFAULT_CONFIG.sessionSampleRate!;
  }

  // Fallback invalid flush intervals
  if (typeof config.flushInterval !== "number" || config.flushInterval <= 0) {
    if (config.debug) console.warn(`Vigil SDK: Invalid flushInterval (${config.flushInterval}). Falling back to ${DEFAULT_CONFIG.flushInterval}.`);
    config.flushInterval = DEFAULT_CONFIG.flushInterval!;
  }

  // URL check
  try {
    new URL(config.endpoint);
  } catch {
    if (config.debug) console.warn(`Vigil SDK: Invalid endpoint URL (${config.endpoint}). Falling back to ${DEFAULT_CONFIG.endpoint}.`);
    config.endpoint = DEFAULT_CONFIG.endpoint!;
  }

  // Environment check
  if (config.environment && !["development", "preview", "production"].includes(config.environment)) {
    if (config.debug) console.warn(`Vigil SDK: Invalid environment (${config.environment}). Must be development, preview, or production.`);
    config.environment = undefined;
  }

  return true;
}
