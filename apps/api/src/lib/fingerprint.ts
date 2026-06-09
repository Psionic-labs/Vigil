/**
 * @file fingerprint.ts
 * @description Formats and hashes session errors to generate unique error fingerprints.
 * @why Groups identical errors together even across different sessions and stack trace lines.
 */


import crypto from "node:crypto";
import type { SummaryEvent } from "../validation/ingest-schema";

/**
 * normalizeUrlPath
 * Normalizes URL strings by stripping protocol, domains, port, query params, and hashes.
 * Replaces dynamic variables (e.g. integer IDs, UUIDs, hex tokens) with a static ":id" token.
 * Prevents route parameter variations (e.g., `/user/123` vs `/user/456`) from generating separate issues.
 *
 * @param urlStr URL address to normalize
 * @returns Cleaned path string (e.g., `/user/:id/profile`)
 */
export function normalizeUrlPath(urlStr: string | null | undefined): string {
  if (!urlStr) return "";
  let pathname: string;
  try {
    if (urlStr.includes("://") || urlStr.startsWith("//")) {
      const parsed = new URL(urlStr);
      pathname = parsed.pathname || "";
    } else {
      pathname = (urlStr.split("?")[0] || "").split("#")[0] || "";
    }
  } catch {
    pathname = (urlStr.split("?")[0] || "").split("#")[0] || "";
  }

  const parts = pathname.split("/");
  const normalized = parts.map(part => {
    const p = part.trim();
    if (!p) return "";
    // Replace raw digits, UUID strings, or hex/hash blocks with ':id'
    if (/^\d+$/.test(p)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) return ":id";
    if (/^[0-9a-f]{8,}$/i.test(p)) return ":id";
    return p;
  });
  return normalized.join("/");
}

/**
 * normalizeTarget
 * Cleans selector/target metadata string or object by filtering dynamic identifiers and class names.
 * Classes are sorted alphabetically to guarantee order-insensitivity.
 *
 * @param target Raw selector target value (JSON string or simple selector string)
 * @returns Standardized selector string
 */
export function normalizeTarget(target: string | null | undefined): string {
  if (!target) return "";
  const trimmed = target.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed);
      const tag = String(obj.tagName || obj.tag || "element").toLowerCase();
      let idStr = "";
      if (obj.id) {
        let idVal = String(obj.id).trim();
        idVal = idVal.replace(/\b\d{4,}\b/g, ":id")
                     .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ":id")
                     .replace(/\b[0-9a-f]{8,}\b/gi, ":id");
        idStr = `#${idVal}`;
      }
      let classStr = "";
      const classVal = obj.className || obj.class || "";
      if (classVal) {
        // Filter out class names containing numbers or hex sequences (often generated dynamic tailwind/webpack CSS hashes)
        const classes = String(classVal)
          .split(/\s+/)
          .map(c => c.trim())
          .filter(c => c && !/\d{4,}/.test(c) && !/[a-f0-9]{8,}/i.test(c))
          .sort(); // Sort to ensure css order variations yield identical strings
        if (classes.length > 0) {
          classStr = `.${classes.join(".")}`;
        }
      }
      return `${tag}${idStr}${classStr}`;
    } catch {
      // Fallback to string normalizer below
    }
  }

  let normalized = trimmed.toLowerCase();
  normalized = normalized.replace(/#([a-z0-9_-]+)/g, (match) => {
    return match.replace(/\d{4,}/g, ":id").replace(/[0-9a-f]{8,}/gi, ":id");
  });
  normalized = normalized.replace(/\.([a-z0-9_-]+)/g, (match) => {
    return match.replace(/\d{4,}/g, ":id").replace(/[0-9a-f]{8,}/gi, ":id");
  });
  return normalized;
}

/**
 * normalizeError
 * Generates a stable signature of a JS error by normalizing the error message
 * and parsing the top 3 stable frame traces from the callstack.
 *
 * @param message Error message
 * @param stack Exception callstack string
 * @returns Standardized diagnostic signature string
 */
export function normalizeError(
  message: string | null | undefined,
  stack: string | null | undefined
): string {
  const msg = message ? String(message).trim() : "";
  const normMsg = msg
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ":uuid")
    .replace(/\b\d{4,}\b/g, ":id")
    .replace(/\b[0-9a-f]{8,}\b/gi, ":hash")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const stackStr = stack ? String(stack).trim() : "";
  if (!stackStr) {
    return normMsg;
  }

  const lines = stackStr.split("\n");
  const frames: string[] = [];

  for (const line of lines) {
    if (frames.length >= 3) break; // Limit stack parse to top 3 frames for grouping stability
    
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // V8 Callstack line parse format: "at functionName (path/to/file.js:12:34)"
    const v8Match = trimmedLine.match(/^\s*at\s+(?:(?<func>[^(]+?)\s+\()?(?<file>[^\s)]+?):(?<line>\d+):(?<col>\d+)\)?/i);
    if (v8Match && v8Match.groups) {
      const func = (v8Match.groups.func || "anonymous").trim().toLowerCase();
      const file = (v8Match.groups.file || "").toLowerCase();
      const lineNum = v8Match.groups.line || "";
      
      const filename = file.split("/").pop() || file;
      // Strip webpack dynamic bundle/source map hashes (e.g. bundle.abcdef12.js -> bundle.js)
      const cleanFilename = filename
        .replace(/\.[a-z0-9]{8,}(?=\.[a-z0-9]+$)/i, "")
        .replace(/-[a-z0-9]{8,}(?=\.[a-z0-9]+$)/i, "");

      frames.push(`${func}@${cleanFilename}:${lineNum}`);
      continue;
    }

    // Firefox/Safari Callstack line parse format: "functionName@path/to/file.js:12:34"
    const ffMatch = trimmedLine.match(/^(?:(?<func>[^@\s]+?))?@(?<file>[^\s]+?):(?<line>\d+):(?<col>\d+)/i);
    if (ffMatch && ffMatch.groups) {
      const func = (ffMatch.groups.func || "anonymous").trim().toLowerCase();
      const file = (ffMatch.groups.file || "").toLowerCase();
      const lineNum = ffMatch.groups.line || "";
      
      const filename = file.split("/").pop() || file;
      const cleanFilename = filename
        .replace(/\.[a-z0-9]{8,}(?=\.[a-z0-9]+$)/i, "")
        .replace(/-[a-z0-9]{8,}(?=\.[a-z0-9]+$)/i, "");

      frames.push(`${func}@${cleanFilename}:${lineNum}`);
      continue;
    }
  }

  if (frames.length === 0) {
    return normMsg;
  }

  return `${normMsg}:${frames.join("|")}`;
}

/**
 * generateFingerprint
 * Compiles normalizations for an event and hashes the signature deterministically using SHA-256.
 *
 * @param event The summary telemetry event
 * @param pageUrl The URL path where the event occurred
 * @returns Hex-encoded SHA-256 signature
 */
export function generateFingerprint(event: SummaryEvent, pageUrl?: string): string {
  let payload: string;

  switch (event.type) {
    case "js_error":
    case "console_error": {
      const msg = event.errorMessage || event.message || "";
      const stack = event.errorStack || event.stack || "";
      payload = `js_error:${normalizeError(msg, stack)}`;
      break;
    }
    case "network_error": {
      const method = String(event.networkMethod || "GET").toUpperCase();
      const normPath = normalizeUrlPath(event.networkUrl || "");
      const status = event.networkStatus !== undefined ? String(event.networkStatus) : "0";
      payload = `network_error:${method}:${normPath}:${status}`;
      break;
    }
    case "click":
    case "significant_click":
    case "rage_click":
    case "dead_click": {
      const pagePath = normalizeUrlPath(pageUrl || "");
      let rawTarget: string;
      if (typeof event.target === "object" && event.target !== null) {
        rawTarget = JSON.stringify(event.target);
      } else {
        rawTarget = event.target ? String(event.target) : "";
      }
      const normTarget = normalizeTarget(rawTarget);
      payload = `${event.type}:${pagePath}:${normTarget}`;
      break;
    }
    case "navigation": {
      const normNavTo = normalizeUrlPath(event.navTo || "");
      payload = `navigation:${normNavTo}`;
      break;
    }
    default: {
      payload = `unknown:${event.type}`;
      break;
    }
  }

  // Bounds payload length limit to 10KB to prevent memory overflow issues
  const boundedPayload = payload.substring(0, 10000);

  return crypto.createHash("sha256").update(boundedPayload).digest("hex");
}
