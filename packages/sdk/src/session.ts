/**
 * session.ts
 *
 * Manages the Vigil session ID for a browser tab.
 *
 * Rules:
 *  - One session ID per browser tab lifetime (sessionStorage is tab-scoped).
 *  - Persists across soft navigations (SPA pushState, page reloads within the tab).
 *  - Cleared automatically when the tab is closed (sessionStorage behaviour).
 *  - Falls back gracefully if sessionStorage is unavailable (private-mode restrictions, etc.).
 */

const SESSION_KEY = "vigil_session_id";
const SAMPLED_OUT_KEY = "vigil_sampled_out";

let fallbackSessionId: string | undefined;
let fallbackSampledOut = false;

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(31);
    crypto.getRandomValues(bytes);
    let i = 0;
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = bytes[i++]! % 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Checks or establishes the sampling decision for the current session.
 */
export function isSessionSampled(sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;

  try {
    const sampledOut = sessionStorage.getItem(SAMPLED_OUT_KEY);
    if (sampledOut === "1") return false;
    
    // If we have an existing session ID but no sampled out key, we assume it's sampled in.
    if (sessionStorage.getItem(SESSION_KEY)) return true;

    // We don't have a session yet. Make a decision.
    const isSampledIn = Math.random() < sampleRate;
    if (!isSampledIn) {
      sessionStorage.setItem(SAMPLED_OUT_KEY, "1");
    }
    return isSampledIn;
  } catch {
    // SessionStorage unavailable
    if (fallbackSessionId) return !fallbackSampledOut;
    
    const isSampledIn = Math.random() < sampleRate;
    fallbackSampledOut = !isSampledIn;
    return isSampledIn;
  }
}

export function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const id = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    if (fallbackSessionId) return fallbackSessionId;
    fallbackSessionId = generateSessionId();
    return fallbackSessionId;
  }
}

