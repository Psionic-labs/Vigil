/**
 * @file timeline.ts
 * @description Assembles a compact, chronological, human-readable timeline of key events for session triage.
 * @why Provides concise user-activity context for the LLM without exceeding context windows or including noisy interaction logs.
 */

import { pool } from "../../db";

export interface SessionTimeline {
  summary: string;       // Formatted string timeline of user activity
  eventCount: number;    // Number of events included in the final timeline
  truncated: boolean;    // Flag indicating if events were dropped due to limits
  fingerprints: string[]; // Deduplicated list of error fingerprints present in the session events
}

interface DBEvent {
  type: string;
  timestamp_ms: string | number;
  target?: string | null;
  error_message?: string | null;
  error_stack?: string | null;
  network_url?: string | null;
  network_status?: number | null;
  network_method?: string | null;
  click_count?: number | null;
  nav_to?: string | null;
  fingerprint?: string | null;
}

// The set of event types that represent meaningful user interactions, errors, or frustration signals.
const PRIORITIZED_TYPES = new Set([
  "page_view",
  "navigation",
  "click",
  "input",
  "js_error",
  "network_error",
  "dead_click",
  "rage_click",
  "console_error"
]);

/**
 * truncate
 * Helper to restrict long text details (like error messages or selector targets) to fit size bounds.
 *
 * @param val Raw string to truncate.
 * @param max Maximum length allowed.
 */
function truncate(val: string | null | undefined, max: number): string {
  if (!val) return "";
  return val.length > max ? val.substring(0, max) + "..." : val;
}

/**
 * formatEvent
 * Renders a single event into a compact plain text entry relative to session start.
 *
 * @param event The database event row.
 * @param baselineMs The absolute timestamp of the first event in milliseconds (00:00).
 */
function formatEvent(event: DBEvent, baselineMs: number): string {
  const elapsedMs = Number(event.timestamp_ms) - baselineMs;
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const targetStr = event.target ? truncate(String(event.target), 80) : "";

  switch (event.type) {
    case "page_view":
      return `${timestamp} Page View: ${truncate(event.nav_to || "/", 100)}`;
    case "navigation":
      return `${timestamp} Navigation: ${truncate(event.nav_to || "/", 100)}`;
    case "click":
      return `${timestamp} Click: ${targetStr || "Unknown Element"}`;
    case "input":
      return `${timestamp} Input: ${targetStr || "Unknown Field"}`;
    case "js_error":
      return `${timestamp} JS Error: ${truncate(event.error_message, 150)}\nStack: ${truncate(event.error_stack, 300)}`;
    case "console_error":
      return `${timestamp} Console Error: ${truncate(event.error_message || event.target, 200)}`;
    case "network_error": {
      const method = event.network_method || "GET";
      const status = event.network_status ? ` (Status: ${event.network_status})` : "";
      return `${timestamp} Network Error: ${method} ${truncate(event.network_url, 120)}${status}`;
    }
    case "dead_click":
      return `${timestamp} Dead Click: ${targetStr || "Unknown Element"}`;
    case "rage_click": {
      const count = event.click_count ? ` (${event.click_count} clicks)` : "";
      return `${timestamp} Rage Click: ${targetStr || "Unknown Element"}${count}`;
    }
    default:
      return `${timestamp} Event (${event.type}): ${targetStr}`;
  }
}

/**
 * selectEvents
 * Applies priority-based compression to filter down raw events.
 *
 * Priorities:
 * 1 (Highest): First JS/network error, last JS/network error, all rage_clicks, all dead_clicks.
 * 2 (Medium-High): Other errors (console_error, other middle js_error/network_error events).
 * 3 (Medium): Final 10 actions (preserves final session context).
 * 4 (Low): General clicks, navigation, inputs prior to final 10.
 *
 * @param filteredEvents Clean list of events containing only PRIORITIZED_TYPES.
 * @param maxLowLimit Current allowed count of low priority events.
 * @param maxMediumLimit Current allowed count of medium priority events.
 */
function selectEvents(filteredEvents: DBEvent[], maxLowLimit: number, maxMediumLimit: number): DBEvent[] {
  const total = filteredEvents.length;

  // Find indices of first and last JS/network errors
  let firstErrIndex = -1;
  let lastErrIndex = -1;
  for (let i = 0; i < total; i++) {
    const event = filteredEvents[i];
    if (event) {
      const type = event.type;
      if (type === "js_error" || type === "network_error") {
        if (firstErrIndex === -1) {
          firstErrIndex = i;
        }
        lastErrIndex = i;
      }
    }
  }

  // Map each event with its original index and priority metadata
  const eventsWithMeta = filteredEvents.map((event, index) => {
    const isP1 =
      index === firstErrIndex ||
      index === lastErrIndex ||
      event.type === "rage_click" ||
      event.type === "dead_click";

    const isP2 =
      !isP1 &&
      (event.type === "console_error" ||
       event.type === "js_error" ||
       event.type === "network_error");

    const isFinalAction = index >= total - maxMediumLimit;
    const isP3 = !isP1 && !isP2 && isFinalAction;

    let priority = 4;
    if (isP1) {
      priority = 1;
    } else if (isP2) {
      priority = 2;
    } else if (isP3) {
      priority = 3;
    }

    return {
      event,
      priority,
      originalIndex: index
    };
  });

  const p1Events = eventsWithMeta.filter(item => item.priority === 1);
  const p2Events = eventsWithMeta.filter(item => item.priority === 2);
  const p3Events = eventsWithMeta.filter(item => item.priority === 3);
  const p4Events = eventsWithMeta.filter(item => item.priority === 4);

  // Apply limits to medium and low priority events
  const restrictedP4 = p4Events.slice(0, maxLowLimit);

  let kept = [...p1Events, ...p2Events, ...p3Events, ...restrictedP4];

  // If the total kept exceeds 50, enforce precedence order (P1 -> P2 -> P3 -> P4)
  // to discard lower priority events down to 50, but NEVER drop P1 events here.
  if (kept.length > 50) {
    kept.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.originalIndex - b.originalIndex;
    });

    const targetSize = Math.max(50, p1Events.length);
    kept = kept.slice(0, targetSize);
  }

  // Sort chronologically by originalIndex to ensure deterministic ordering of retained events
  kept.sort((a, b) => a.originalIndex - b.originalIndex);

  return kept.map(item => item.event);
}

/**
 * buildSessionTimeline
 * Compiles chronological session timeline text and extracts deduplicated session fingerprints.
 *
 * @param sessionId The target session identifier.
 */
export async function buildSessionTimeline(sessionId: string): Promise<SessionTimeline> {
  const result = await pool.query<DBEvent>(
    `
    SELECT type, timestamp_ms, target, error_message, error_stack, network_url, network_status, network_method, click_count, nav_to, fingerprint
    FROM events_summary
    WHERE session_id = $1
    ORDER BY timestamp_ms ASC, id ASC
    `,
    [sessionId]
  );

  const events = result.rows;

  // Filter out mousemoves, scrolls, and other noisy interactions
  const filteredEvents = events.filter((e) => PRIORITIZED_TYPES.has(e.type));

  if (filteredEvents.length === 0) {
    return {
      summary: "No significant user activity recorded.",
      eventCount: 0,
      truncated: false,
      fingerprints: []
    };
  }

  // Extract deduplicated fingerprints from all filtered events in this session
  const fingerprints = Array.from(
    new Set(
      filteredEvents
        .map((e) => e.fingerprint)
        .filter((fp): fp is string => !!fp)
    )
  );

  let maxLowLimit = 50;
  let maxMediumLimit = 10;
  let summary: string;
  let selected: DBEvent[];
  const baselineMs = Number(filteredEvents[0]!.timestamp_ms);

  // Find indices of first and last JS/network errors for fallback dropping
  let firstErrIndex = -1;
  let lastErrIndex = -1;
  for (let i = 0; i < filteredEvents.length; i++) {
    const event = filteredEvents[i];
    if (event) {
      const type = event.type;
      if (type === "js_error" || type === "network_error") {
        if (firstErrIndex === -1) {
          firstErrIndex = i;
        }
        lastErrIndex = i;
      }
    }
  }

  // Compression loop: reduces low/medium count limits if total string exceeds 4000 characters
  while (true) {
    selected = selectEvents(filteredEvents, maxLowLimit, maxMediumLimit);
    if (selected.length === 0) {
      summary = "No significant user activity recorded.";
      break;
    }

    summary = selected.map((e) => formatEvent(e, baselineMs)).join("\n");

    if (summary.length <= 4000) {
      break;
    }

    if (maxLowLimit > 0) {
      maxLowLimit = Math.max(0, maxLowLimit - 5);
    } else if (maxMediumLimit > 0) {
      maxMediumLimit = Math.max(0, maxMediumLimit - 1);
    } else {
      // Hard fallback: discard whole events by priority (Priority 2 first, then Priority 1) from the end
      const selectedWithMeta = selected.map((event) => {
        const indexInFiltered = filteredEvents.indexOf(event);
        const isP1 =
          indexInFiltered === firstErrIndex ||
          indexInFiltered === lastErrIndex ||
          event.type === "rage_click" ||
          event.type === "dead_click";
        const priority = isP1 ? 1 : 2;
        return { event, priority };
      });

      // Drop priority 2 events first (from the end of the timeline)
      for (let i = selectedWithMeta.length - 1; i >= 0; i--) {
        const item = selectedWithMeta[i];
        if (item && item.priority === 2) {
          selectedWithMeta.splice(i, 1);
          summary = selectedWithMeta.map(m => formatEvent(m.event, baselineMs)).join("\n") + "\n...";
          if (summary.length <= 4000) {
            break;
          }
        }
      }

      // If it still exceeds 4000, drop priority 1 events (from the end of the timeline)
      if (summary.length > 4000) {
        for (let i = selectedWithMeta.length - 1; i >= 0; i--) {
          const item = selectedWithMeta[i];
          if (item && item.priority === 1) {
            selectedWithMeta.splice(i, 1);
            if (selectedWithMeta.length === 0) {
              summary = "No significant user activity recorded.";
              break;
            }
            summary = selectedWithMeta.map(m => formatEvent(m.event, baselineMs)).join("\n") + "\n...";
            if (summary.length <= 4000) {
              break;
            }
          }
        }
      }

      selected = selectedWithMeta.map(m => m.event);
      break;
    }
  }

  const isTruncated = filteredEvents.length > selected.length || summary.endsWith("...");

  return {
    summary,
    eventCount: selected.length,
    truncated: isTruncated,
    fingerprints
  };
}
