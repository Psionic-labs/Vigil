/**
 * @file normalize-config.ts
 * @description Converts raw developer config options to a standard internal layout.
 * @why Cleans user inputs and ensures consistency.
 */

import type { VigilOptions, NormalizedVigilOptions } from "../types";
import { DEFAULT_CONFIG } from "./defaults";

export function normalizeConfig(options: VigilOptions): NormalizedVigilOptions {
  return {
    projectKey: options.projectKey,
    maskAllInputs: options.maskAllInputs ?? DEFAULT_CONFIG.maskAllInputs!,
    endpoint: options.endpoint ?? DEFAULT_CONFIG.endpoint!,
    flushInterval: options.flushInterval ?? DEFAULT_CONFIG.flushInterval!,
    sessionSampleRate: options.sessionSampleRate ?? DEFAULT_CONFIG.sessionSampleRate!,
    environment: options.environment,
    release: options.release,
    commitSha: options.commitSha,
    userId: options.userId,
    debug: options.debug ?? DEFAULT_CONFIG.debug!,
    disableSessionReplay: options.disableSessionReplay ?? DEFAULT_CONFIG.disableSessionReplay!,
    disableClickTracking: options.disableClickTracking ?? DEFAULT_CONFIG.disableClickTracking!,
    disableErrorTracking: options.disableErrorTracking ?? DEFAULT_CONFIG.disableErrorTracking!,
    disableNavigationTracking: options.disableNavigationTracking ?? DEFAULT_CONFIG.disableNavigationTracking!,
  };
}
