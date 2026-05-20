/**
 * sampling-storage.ts
 *
 * Manages the persistence of the session sampling decision.
 */

const SAMPLED_OUT_KEY = "vigil_sampled_out";
let fallbackSampledDecision: boolean | undefined;

/**
 * Returns the stored sampling decision for the current session.
 * - true if the session is sampled in.
 * - false if the session is sampled out.
 * - undefined if no decision has been made yet.
 */
export function getStoredSamplingDecision(): boolean | undefined {
  try {
    const storedDecision = sessionStorage.getItem(SAMPLED_OUT_KEY);
    if (storedDecision === "1") return false;
    if (storedDecision === "0") return true;
    return undefined;
  } catch {
    return fallbackSampledDecision;
  }
}

/**
 * Saves the sampling decision for the current session.
 */
export function saveSamplingDecision(isSampledIn: boolean): void {
  try {
    sessionStorage.setItem(SAMPLED_OUT_KEY, isSampledIn ? "0" : "1");
  } catch {
    fallbackSampledDecision = isSampledIn;
  }
}

/**
 * Clears the stored sampling decision (useful for testing or hard resets).
 */
export function clearSamplingDecision(): void {
  try {
    sessionStorage.removeItem(SAMPLED_OUT_KEY);
  } catch {
    // Ignore
  }
  fallbackSampledDecision = undefined;
}
