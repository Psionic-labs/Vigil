/**
 * @file dead-click-detector.ts
 * @description Evaluates whether pointer clicks resulted in actual changes.
 * @why Marks useless user interactions that signal bad UX.
 */

import type { SummaryEvent } from "../types";
import type { NavigationCallback } from "./navigation-observer";

export interface DeadClickContext {
  summaryEvents: SummaryEvent[];
  debug?: boolean;
  /** Subscribe to navigation events from the shared navigation observer. */
  onNavigation?: (cb: NavigationCallback) => () => void;
}

interface PendingClick {
  x: number;
  y: number;
  timestamp: number;
  target: EventTarget | null;
  timeoutId: number;
}

const DEAD_CLICK_TIMEOUT_MS = 500;
const COOLDOWN_MS = 1000;

export function setupDeadClickCapture(ctx: DeadClickContext): () => void {
  // SSR Safety
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof MutationObserver === "undefined"
  ) {
    return () => {};
  }

  let lastActivityTime = Date.now();
  let pendingClicks: PendingClick[] = [];
  let isReporting = false;
  let lastDeadClickTime = 0;

  const updateActivity = () => {
    lastActivityTime = Date.now();
  };

  // 1. Mutation tracking
  // We use a MutationObserver but only keep it active while there are pending clicks
  // to avoid draining battery/CPU observing a noisy page unnecessarily.
  const observer = new MutationObserver(() => {
    updateActivity();
  });

  const startObserving = () => {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  };

  const stopObserving = () => {
    observer.disconnect();
  };

  // 2. Navigation activity tracking
  // Subscribe to the shared navigation observer instead of independently
  // patching history.pushState/replaceState (which caused double-patch conflicts).
  let unsubscribeNav: (() => void) | undefined;
  if (ctx.onNavigation) {
    unsubscribeNav = ctx.onNavigation(() => updateActivity());
  }

  // 3. Evaluation logic
  const evaluateClick = (click: PendingClick) => {
    // Remove from tracking
    pendingClicks = pendingClicks.filter((c) => c !== click);

    if (pendingClicks.length === 0) {
      stopObserving();
    }

    // If activity happened after the click, it means the UI reacted
    if (lastActivityTime > click.timestamp) {
      return;
    }

    // Debounce to prevent a storm of dead clicks if the user clicks 10 times rapidly
    if (click.timestamp - lastDeadClickTime < COOLDOWN_MS) {
      return;
    }

    lastDeadClickTime = click.timestamp;

    // Extract lightweight DOM metadata safely
    const targetEl = click.target as HTMLElement | null;
    let elementData;
    if (targetEl && targetEl.tagName) {
      elementData = {
        tagName: targetEl.tagName.toLowerCase(),
        id: targetEl.id || undefined,
        className: typeof targetEl.className === "string" ? targetEl.className : undefined,
      };
    }

    const event: SummaryEvent = {
      type: "dead_click",
      timestampMs: click.timestamp,
      timestamp: click.timestamp, // legacy support
      x: click.x,
      y: click.y,
      waitTimeMs: DEAD_CLICK_TIMEOUT_MS,
      target: elementData,
    };

    ctx.summaryEvents.push(event);

    if (ctx.debug) {
      console.log("Vigil SDK: Dead click detected", event);
    }
  };

  // 4. Click tracking
  const handleClick = (e: MouseEvent) => {
    try {
      if (isReporting) return;
      isReporting = true;

      const now = Date.now();

      // Only boot up the observer if this is the first pending click
      if (pendingClicks.length === 0) {
        startObserving();
      }

      // Declare object first to avoid Temporal Dead Zone (TDZ) issues
      const clickObj: PendingClick = {
        x: e.clientX,
        y: e.clientY,
        timestamp: now,
        target: e.target,
        timeoutId: 0, // will be replaced immediately below
      };

      // Schedule the evaluation to run exactly DEAD_CLICK_TIMEOUT_MS after the click.
      clickObj.timeoutId = window.setTimeout(() => {
        evaluateClick(clickObj);
      }, DEAD_CLICK_TIMEOUT_MS);

      pendingClicks.push(clickObj);
    } catch (err) {
      if (ctx.debug) console.warn("Vigil SDK: Error tracking dead click", err);
    } finally {
      isReporting = false;
    }
  };

  // Passive and capture for performance and intercept guarantees
  document.addEventListener("click", handleClick, { passive: true, capture: true });

  // Cleanup
  return () => {
    document.removeEventListener("click", handleClick, { capture: true });

    // Unsubscribe from navigation observer
    unsubscribeNav?.();

    stopObserving();

    // Clear pending timers to prevent leaks and after-shutdown emissions
    for (const c of pendingClicks) {
      window.clearTimeout(c.timeoutId);
    }
    pendingClicks = [];
  };
}
