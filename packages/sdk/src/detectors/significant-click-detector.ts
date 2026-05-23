/**
 * @file significant-click-detector.ts
 * @description Tracks user interactions with explicit interactive elements (buttons, links).
 * Uses DOM traversal to resolve clicks on nested elements (like icons inside a button) 
 * up to their semantic parent, capturing safe metadata without leaking PII.
 */
import type { SummaryEvent } from "../types";
import { sanitizeUrl } from "../utils";

export interface SignificantClickContext {
  summaryEvents: SummaryEvent[];
  debug?: boolean;
}

// Constants

/** CSS selector matching interactive elements worth tracking. */
const INTERACTIVE_SELECTOR = 'a, button, [role="button"]';

/** Throttle window: ignore rapid repeated clicks on the same element. */
const THROTTLE_MS = 300;

/** Maximum length for className strings to prevent payload bloat. */
const MAX_CLASS_LEN = 200;

// Target resolution

/**
 * Walk from the actual click target up to the nearest interactive ancestor.
 *
 * This handles the common case where a user clicks an `<svg>` icon or
 * `<span>` label nested inside a `<button>`. Without this, we'd either
 * miss the click entirely or report the wrong element.
 *
 * Returns `null` if the click landed on a non-interactive surface (body
 * text, layout containers, images, etc.) — those are intentionally ignored.
 */
function resolveInteractiveTarget(
  target: EventTarget | null,
): HTMLElement | null {
  // Duck-type check: verify the target has .closest() rather than using
  // `instanceof HTMLElement`, which doesn't exist in Node.js/SSR.
  if (!target || typeof (target as any).closest !== "function") return null;
  return (target as HTMLElement).closest<HTMLElement>(INTERACTIVE_SELECTOR);
}

// Metadata extraction

interface ClickElementMeta {
  tagName: string;
  role?: string;
  id?: string;
  className?: string;
  href?: string;
}

/**
 * Extract a privacy-safe metadata snapshot from a resolved interactive element.
 *
 * What we capture:
 *   - tagName (lowercased)
 *   - role attribute (if present)
 *   - id (if present)
 *   - className (truncated to MAX_CLASS_LEN)
 *   - href (sanitized: origin + pathname only, no query/hash/tokens)
 *
 * What we deliberately exclude:
 *   - textContent / innerText (privacy risk, localization noise)
 *   - innerHTML / DOM snapshots
 *   - form values, data-* attributes, aria-label text
 *   - full href with query params (may contain auth tokens, PII)
 */
function extractElementMeta(el: HTMLElement): ClickElementMeta {
  const meta: ClickElementMeta = {
    tagName: el.tagName.toLowerCase(),
  };

  const role = el.getAttribute("role");
  if (role) meta.role = role;

  if (el.id) meta.id = el.id;

  if (typeof el.className === "string" && el.className) {
    meta.className =
      el.className.length > MAX_CLASS_LEN
        ? el.className.slice(0, MAX_CLASS_LEN)
        : el.className;
  }

  // Only extract href from anchor elements, sanitized to strip tokens/PII
  if (el.tagName === "A") {
    const href = (el as HTMLAnchorElement).href;
    if (href) {
      meta.href = sanitizeUrl(href);
    }
  }

  return meta;
}

// Deduplication fingerprint

/**
 * Build a lightweight string key from element identity to throttle
 * rapid repeated clicks on the same interactive target.
 *
 * Uses tagName + id + className prefix. This is intentionally coarse —
 * we want to suppress duplicates from the same logical button, not
 * create a perfect unique identifier.
 */
function elementFingerprint(meta: ClickElementMeta): string {
  return `${meta.tagName}#${meta.id || ""}|${(meta.className || "").slice(0, 40)}`;
}

// Detector setup

export function setupSignificantClickCapture(
  ctx: SignificantClickContext,
): () => void {
  // SSR Safety
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  // Defensive guard for rare synchronous re-entry from third-party wrappers (e.g. patched console hooks).
  let isReporting = false;
  let lastClickFingerprint = "";
  let lastClickTime = 0;

  const handleClick = (e: MouseEvent) => {
    try {
      if (isReporting) return;
      isReporting = true;

      // 1. Resolve click target to nearest interactive ancestor
      const el = resolveInteractiveTarget(e.target);
      if (!el) return; // Not an interactive element — skip silently

      // 2. Extract safe metadata
      const meta = extractElementMeta(el);

      // 3. Throttle repeated clicks on the same element
      const now = Date.now();
      const fp = elementFingerprint(meta);

      if (fp === lastClickFingerprint && now - lastClickTime < THROTTLE_MS) {
        return; // Suppress rapid duplicate
      }

      lastClickFingerprint = fp;
      lastClickTime = now;

      // 4. Emit event
      const event: SummaryEvent = {
        type: "significant_click",
        timestampMs: now,
        timestamp: now,
        x: e.clientX,
        y: e.clientY,
        target: meta,
      };

      ctx.summaryEvents.push(event);

      if (ctx.debug) {
        console.log("Vigil SDK: Significant click", event);
      }
    } catch (err) {
      // Defensive: never throw from the SDK into the host application
      if (ctx.debug) {
        console.warn("Vigil SDK: Error in significant click detection", err);
      }
    } finally {
      isReporting = false;
    }
  };

  // Single delegated listener on document, passive + capture phase
  // for earliest interception without blocking the UI thread.
  document.addEventListener("click", handleClick, {
    passive: true,
    capture: true,
  });

  return () => {
    document.removeEventListener("click", handleClick, { capture: true });
    lastClickFingerprint = "";
    lastClickTime = 0;
  };
}
