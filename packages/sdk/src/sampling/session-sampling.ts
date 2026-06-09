/**
 * @file session-sampling.ts
 * @description Evaluates whether a session should be tracked according to options.
 * @why Controls cloud costs and bandwidth usage via percentage sampling.
 */

import { getStoredSamplingDecision, saveSamplingDecision } from "./sampling-storage";

/**
 * Determines whether the current session is sampled in.
 * Uses a stable fallback or `sessionStorage` to persist the decision.
 * 
 * @param sampleRate 0.0 to 1.0
 */
export function isSessionSampled(sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;

  const storedDecision = getStoredSamplingDecision();
  if (storedDecision !== undefined) {
    return storedDecision;
  }

  // We don't have a session decision yet. Make one.
  const isSampledIn = Math.random() < sampleRate;
  saveSamplingDecision(isSampledIn);
  return isSampledIn;
}
