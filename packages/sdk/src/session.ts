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

// Fallback session ID for when sessionStorage is unavailable
let fallbackSessionId: string | undefined;

/**
 * Generate a random session ID.
 *
 * Uses `crypto.randomUUID()` when available (all modern browsers).
 * Falls back to a manual hex string for older environments.
 */
function generateSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Middle fallback: High-entropy crypto.getRandomValues
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(31);
    crypto.getRandomValues(bytes);
    let i = 0;
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = bytes[i++]! % 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Last resort fallback: Low-entropy Math.random()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the current session ID, creating and persisting one if it doesn't
 * already exist in sessionStorage.
 *
 * Callers should treat the returned value as stable for the tab's lifetime.
 */
export function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      return existing;
    }

    const id = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // sessionStorage throws in some private-browsing modes.
    // Use a cached fallback ID to maintain stability across calls.
    if (fallbackSessionId) {
      return fallbackSessionId;
    }
    fallbackSessionId = generateSessionId();
    return fallbackSessionId;
  }
}
