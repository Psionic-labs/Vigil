/**
 * @file rage-click-detector.ts
 * @description Identifies user frustration by tracking rapid, clustered clicks.
 * Enforces a spatial boundary (clicks must be close to each other) and a temporal 
 * boundary (must occur within 2 seconds) to accurately classify a rage click.
 */
import type { SummaryEvent } from "../types";

export interface RageClickContext {
  summaryEvents: SummaryEvent[];
  debug?: boolean;
}

interface ClickRecord {
  x: number;
  y: number;
  timestamp: number;
  target: EventTarget | null;
}

const RAGE_CLICK_THRESHOLD_COUNT = 3;
const RAGE_CLICK_TIME_WINDOW_MS = 2000;
const RAGE_CLICK_DISTANCE_PX = 500;
const COOLDOWN_MS = 3000; // Debounce subsequent rage clicks by 3s

export function setupRageClickCapture(ctx: RageClickContext): () => void {
  // SSR Safety: Do nothing if we are not in a browser environment
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let clicks: ClickRecord[] = [];
  let isReporting = false;
  let lastRageClickTime = 0;

  const handleClick = (e: MouseEvent) => {
    try {
      if (isReporting) return;
      isReporting = true;

      const now = Date.now();

      // Enqueue the new click
      clicks.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: now,
        target: e.target,
      });

      // Aggressively trim clicks older than the time window to keep memory bounded
      clicks = clicks.filter((c) => now - c.timestamp <= RAGE_CLICK_TIME_WINDOW_MS);

      // Check if we meet the minimum click count
      if (clicks.length >= RAGE_CLICK_THRESHOLD_COUNT) {
        // Enforce cooldown to prevent event storms from rapid clicking
        if (now - lastRageClickTime < COOLDOWN_MS) {
          return;
        }

        // Only evaluate the most recent N clicks
        const recentClicks = clicks.slice(-RAGE_CLICK_THRESHOLD_COUNT);
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const c of recentClicks) {
          if (c.x < minX) minX = c.x;
          if (c.x > maxX) maxX = c.x;
          if (c.y < minY) minY = c.y;
          if (c.y > maxY) maxY = c.y;
        }

        const width = maxX - minX;
        const height = maxY - minY;

        // Ensure all clicks occurred within the specified maximum distance
        const maxDimension = Math.max(width, height);

        if (maxDimension <= RAGE_CLICK_DISTANCE_PX) {
          // Detected a rage click burst!
          lastRageClickTime = now;

          // Clear the buffer to reset the counter
          clicks = [];

          // Extract lightweight, safe target metadata
          const targetEl = e.target as HTMLElement | null;
          let elementData;
          if (targetEl && targetEl.tagName) {
            elementData = {
              tagName: targetEl.tagName.toLowerCase(),
              id: targetEl.id || undefined,
              className: typeof targetEl.className === "string" ? targetEl.className : undefined,
            };
          }

          const event: SummaryEvent = {
            type: "rage_click",
            timestampMs: now,
            timestamp: now, // Support legacy schema requirement if needed
            clickCount: RAGE_CLICK_THRESHOLD_COUNT,
            area: {
              minX,
              maxX,
              minY,
              maxY
            },
            target: elementData,
          };

          ctx.summaryEvents.push(event);

          if (ctx.debug) {
            console.log("Vigil SDK: Rage click detected", event);
          }
        }
      }
    } catch (err) {
      // Defensive: never throw from the SDK into the host application
      if (ctx.debug) {
        console.warn("Vigil SDK: Error in rage click detection", err);
      }
    } finally {
      isReporting = false;
    }
  };

  // Use passive and capture to ensure we get the event early and without blocking UI thread
  document.addEventListener("click", handleClick, { passive: true, capture: true });

  return () => {
    document.removeEventListener("click", handleClick, { capture: true });
    clicks = []; // Free memory
  };
}
