import crypto from "node:crypto";
import type { SummaryEvent } from "../validation/ingest-schema";

/**
 * Normalizes a URL path by stripping protocol, host, query parameters,
 * hashes, and replacing dynamic identifiers (e.g. numbers, UUIDs, hex hashes)
 * with a standard placeholder ":id".
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
    if (/^\d+$/.test(p)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) return ":id";
    if (/^[0-9a-f]{8,}$/i.test(p)) return ":id";
    return p;
  });
  return normalized.join("/");
}

/**
 * Normalizes element identities (JSON selector or string targets) by removing
 * dynamic classes/IDs and sorting class names to ensure order-insensitivity.
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
        const classes = String(classVal)
          .split(/\s+/)
          .map(c => c.trim())
          .filter(c => c && !/\d{4,}/.test(c) && !/[a-f0-9]{8,}/i.test(c))
          .sort();
        if (classes.length > 0) {
          classStr = `.${classes.join(".")}`;
        }
      }
      return `${tag}${idStr}${classStr}`;
    } catch {
      // fallback to string normalizer
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
 * Normalizes error messages and extracts up to the top 3 stable frames,
 * stripping release hashes and ignoring col numbers to prevent over-fragmentation.
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
    if (frames.length >= 3) break;
    
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // V8 format: "at functionName (path/to/file.js:12:34)"
    const v8Match = trimmedLine.match(/^\s*at\s+(?:(?<func>[^(]+?)\s+\()?(?<file>[^\s)]+?):(?<line>\d+):(?<col>\d+)\)?/i);
    if (v8Match && v8Match.groups) {
      const func = (v8Match.groups.func || "anonymous").trim().toLowerCase();
      const file = (v8Match.groups.file || "").toLowerCase();
      const lineNum = v8Match.groups.line || "";
      
      const filename = file.split("/").pop() || file;
      const cleanFilename = filename
        .replace(/\.[a-z0-9]{8,}(?=\.[a-z0-9]+$)/i, "")
        .replace(/-[a-z0-9]{8,}(?=\.[a-z0-9]+$)/i, "");

      frames.push(`${func}@${cleanFilename}:${lineNum}`);
      continue;
    }

    // Firefox/Safari format: "functionName@path/to/file.js:12:34"
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
 * Generates a stable, deterministic signal fingerprint for a summary event.
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

  // Bounded input length to prevent dynamic overflow / memory bloat
  const boundedPayload = payload.substring(0, 10000);

  return crypto.createHash("sha256").update(boundedPayload).digest("hex");
}
