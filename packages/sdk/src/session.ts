/**
 * @file session.ts
 * @description Manages the Vigil session ID for a browser tab.
 *
 * Rules:
 *  - One session ID per browser tab lifetime (sessionStorage is tab-scoped).
 *  - Persists across soft navigations (SPA pushState, page reloads within the tab).
 *  - Cleared automatically when the tab is closed (sessionStorage behaviour).
 *  - Falls back gracefully if sessionStorage is unavailable (private-mode restrictions, etc.).
 */

const SESSION_KEY = "vigil_session_id";
let fallbackSessionId: string | undefined;

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

export function clearSessionId(): void {
  fallbackSessionId = undefined;
  try {
    const s = sessionStorage;
    s.removeItem(SESSION_KEY);
  } catch {
    // Ignore
  }
}
