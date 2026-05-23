/**
 * @file defaults.ts
 * @description Provides the fallback default configuration values for the SDK.
 * These are applied if the host application omits optional properties during initialization.
 */
import type { NormalizedVigilOptions } from "../types";

export const DEFAULT_ENDPOINT = "https://ingest.usevigilhq.com/api/ingest";
export const DEFAULT_FLUSH_INTERVAL = 5000;
export const DEFAULT_SESSION_SAMPLE_RATE = 1.0;

export const DEFAULT_CONFIG: Partial<NormalizedVigilOptions> = {
  maskAllInputs: true,
  endpoint: DEFAULT_ENDPOINT,
  flushInterval: DEFAULT_FLUSH_INTERVAL,
  sessionSampleRate: DEFAULT_SESSION_SAMPLE_RATE,
  debug: false,
  disableSessionReplay: false,
  disableClickTracking: false,
  disableErrorTracking: false,
  disableNavigationTracking: false,
};
