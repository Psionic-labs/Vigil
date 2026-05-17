import type { SummaryEvent } from "../types";
import { sanitizeUrl } from "../utils";

export interface NavigationContext {
  summaryEvents: SummaryEvent[];
  debug?: boolean;
}

export type NavigationType = "pushState" | "replaceState" | "popstate" | "hashchange";

/**
 * Callback for navigation subscribers.
 * The dead-click detector subscribes here to learn about route changes
 * without independently patching history — avoiding double-patch conflicts.
 */
export type NavigationCallback = (type: NavigationType) => void;

// Frameworks like Next.js and React Router commonly fire pushState
// twice for a single logical navigation. Suppress identical from→to
// navigations within this window.
const DEDUP_WINDOW_MS = 50;

export function setupNavigationCapture(ctx: NavigationContext): {
  cleanup: () => void;
  subscribe: (cb: NavigationCallback) => () => void;
} {
  // SSR Safety
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      cleanup: () => {},
      subscribe: () => () => {},
    };
  }

  const subscribers: Set<NavigationCallback> = new Set();

  const notify = (type: NavigationType) => {
    for (const cb of subscribers) {
      try {
        cb(type);
      } catch {
        // Never let a subscriber crash the navigation tracker
      }
    }
  };

  // Current URL tracking for from→to diffing
  let currentUrl = sanitizeUrl(window.location.href);

  // Deduplication state
  let lastNavTo = "";
  let lastNavTime = 0;

  const emitNavigation = (type: NavigationType, toRaw: string) => {
    try {
      const to = sanitizeUrl(toRaw);
      const now = Date.now();

      // Always notify subscribers (dead-click detector needs activity signals
      // even for duplicate/same-page navigations)
      notify(type);

      // Suppress exact duplicate navigations within the dedup window.
      // Handles React Router / Next.js double-firing pushState.
      if (to === lastNavTo && now - lastNavTime < DEDUP_WINDOW_MS) {
        return;
      }

      // Suppress no-op navigations (same page) for pushState/replaceState.
      // popstate is exempted: back→forward can land on the same sanitized URL
      // with different state, and we still want to record that the user navigated.
      if (to === currentUrl && type !== "popstate") {
        return;
      }

      const from = currentUrl;
      currentUrl = to;
      lastNavTo = to;
      lastNavTime = now;

      const event: SummaryEvent = {
        type: "navigation",
        timestampMs: now,
        timestamp: now,
        navFrom: from,
        navTo: to,
        navigationType: type,
      };

      ctx.summaryEvents.push(event);

      if (ctx.debug) {
        console.log("Vigil SDK: Navigation", type, from, "→", to);
      }
    } catch (err) {
      if (ctx.debug) {
        console.warn("Vigil SDK: Error emitting navigation event", err);
      }
    }
  };

  // 1. Patch history.pushState / replaceState
  const originalPushState = window.history?.pushState;
  const originalReplaceState = window.history?.replaceState;

  let vigilPatchedPushState: any;
  let vigilPatchedReplaceState: any;

  if (window.history) {
    vigilPatchedPushState = function (
      this: History,
      data: any,
      unused: string,
      url?: string | URL | null,
    ) {
      // Call original FIRST to preserve browser semantics.
      // If the original throws (e.g. SecurityError), we don't emit.
      const result = originalPushState?.call(this, data, unused, url);
      emitNavigation("pushState", window.location.href);
      return result;
    };

    vigilPatchedReplaceState = function (
      this: History,
      data: any,
      unused: string,
      url?: string | URL | null,
    ) {
      const result = originalReplaceState?.call(this, data, unused, url);
      emitNavigation("replaceState", window.location.href);
      return result;
    };

    window.history.pushState = vigilPatchedPushState;
    window.history.replaceState = vigilPatchedReplaceState;
  }

  // 2. Listen for popstate (browser back/forward)
  const handlePopstate = () => {
    emitNavigation("popstate", window.location.href);
  };

  // 3. Listen for hashchange (hash-based routing, e.g. Vue Router hash mode)
  const handleHashchange = () => {
    emitNavigation("hashchange", window.location.href);
  };

  window.addEventListener("popstate", handlePopstate, { passive: true });
  window.addEventListener("hashchange", handleHashchange, { passive: true });

  // Cleanup
  const cleanup = () => {
    window.removeEventListener("popstate", handlePopstate);
    window.removeEventListener("hashchange", handleHashchange);

    // Restore history patches only if no other library wrapped them after us
    if (window.history) {
      if (window.history.pushState === vigilPatchedPushState) {
        window.history.pushState = originalPushState as any;
      }
      if (window.history.replaceState === vigilPatchedReplaceState) {
        window.history.replaceState = originalReplaceState as any;
      }
    }

    subscribers.clear();
  };

  const subscribe = (cb: NavigationCallback): (() => void) => {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  };

  return { cleanup, subscribe };
}
