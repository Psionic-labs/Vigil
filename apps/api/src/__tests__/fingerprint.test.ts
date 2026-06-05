/**
 * @file fingerprint.test.ts
 * @description Tests key event fingerprinting algorithms and grouping mappings.
 * @why Ensures unique issue identification and correct association with candidate groups.
 */

import { describe, it, expect } from "vitest";
import { 
  normalizeUrlPath, 
  normalizeTarget, 
  normalizeError, 
  generateFingerprint 
} from "../lib/fingerprint";
import type { SummaryEvent } from "../validation/ingest-schema";
import crypto from "node:crypto";

describe("Deterministic Signal Fingerprinting", () => {
  
  describe("URL and Path Normalization", () => {
    it("should strip query parameters and hash fragments", () => {
      const url1 = "http://api.com/users/profile?token=abc&v=2#details";
      const url2 = "http://api.com/users/profile";
      expect(normalizeUrlPath(url1)).toBe(normalizeUrlPath(url2));
      expect(normalizeUrlPath(url1)).toBe("/users/profile");
    });

    it("should collapse dynamic numeric ID segments into :id", () => {
      const url = "https://app.com/api/v1/posts/87293/comments/382";
      expect(normalizeUrlPath(url)).toBe("/api/v1/posts/:id/comments/:id");
    });

    it("should collapse UUID segments into :id", () => {
      const url = "https://app.com/projects/4862f91a-7b3b-4c22-b91c-0e86bfa32244/dashboard";
      expect(normalizeUrlPath(url)).toBe("/projects/:id/dashboard");
    });

    it("should collapse long hex hash-like segments into :id", () => {
      const url = "/static/chunks/abc123def456/main.js";
      expect(normalizeUrlPath(url)).toBe("/static/chunks/:id/main.js");
    });

    it("should handle relative paths and empty inputs safely", () => {
      expect(normalizeUrlPath("/")).toBe("/");
      expect(normalizeUrlPath("")).toBe("");
      expect(normalizeUrlPath(null)).toBe("");
    });
  });

  describe("DOM Target Normalization", () => {
    it("should normalize string selectors by stripping dynamic trailing numeric IDs", () => {
      const selector = "div#item-48392 > button.btn.btn-12938";
      expect(normalizeTarget(selector)).toBe("div#item-:id > button.btn.btn-:id");
    });

    it("should parse and normalize JSON string DOM targets", () => {
      const targetObj = {
        tagName: "BUTTON",
        id: "btn-4839",
        className: "btn btn-primary active btn-28492"
      };
      const serialized = JSON.stringify(targetObj);
      // Alphabetically sorted and cleaned: tagname + id + sorted non-dynamic classes
      expect(normalizeTarget(serialized)).toBe("button#btn-:id.active.btn.btn-primary");
    });

    it("should sort JSON target classNames alphabetically for order-insensitive grouping", () => {
      const target1 = JSON.stringify({ tagName: "DIV", className: "z-10 flex col-span-3" });
      const target2 = JSON.stringify({ tagName: "DIV", className: "flex col-span-3 z-10" });
      expect(normalizeTarget(target1)).toBe(normalizeTarget(target2));
      expect(normalizeTarget(target1)).toBe("div.col-span-3.flex.z-10");
    });

    it("should filter out dynamic/compiled utility class names in JSON targets", () => {
      const target = JSON.stringify({
        tagName: "SPAN",
        className: "label label-9821 text-red-500 css-1ab2c3d4"
      });
      // Removes label-9821 and css-1ab2c3d4
      expect(normalizeTarget(target)).toBe("span.label.text-red-500");
    });
  });

  describe("Error Message and Stack Trace Normalization", () => {
    it("should normalize dynamic IDs, UUIDs, and hashes in error messages", () => {
      const msg1 = "Failed to fetch user 98219: database error";
      const msg2 = "Failed to fetch user 48312: database error";
      expect(normalizeError(msg1, null)).toBe(normalizeError(msg2, null));
      expect(normalizeError(msg1, null)).toBe("failed to fetch user :id: database error");
      
      const uuidMsg = "Resource 4862f91a-7b3b-4c22-b91c-0e86bfa32244 not found";
      expect(normalizeError(uuidMsg, null)).toContain(":uuid");
    });

    it("should parse top 3 frames from V8 stack trace, ignoring columns", () => {
      const stack = `Error: Bad reference
        at renderComponent (http://localhost:3000/src/components/button.tsx:24:18)
        at onClick (http://localhost:3000/src/components/button.tsx:12:9)
        at HTMLButtonElement.dispatchEvent (http://localhost:3000/node_modules/react-dom/index.js:104:12)
        at anotherUnusedFrame (http://localhost:3000/index.js:5:2)`;
      
      const norm = normalizeError("Bad reference", stack);
      expect(norm).toContain("rendercomponent@button.tsx:24");
      expect(norm).toContain("onclick@button.tsx:12");
      expect(norm).toContain("htmlbuttonelement.dispatchevent@index.js:104");
      expect(norm).not.toContain("anotherunusedframe");
    });

    it("should parse Firefox stack trace format", () => {
      const stack = `renderComponent@http://localhost:3000/src/components/button.tsx:24:18
        onClick@http://localhost:3000/src/components/button.tsx:12:9
        dispatchEvent@http://localhost:3000/node_modules/react-dom/index.js:104:12`;
      
      const norm = normalizeError("Bad reference", stack);
      expect(norm).toContain("rendercomponent@button.tsx:24");
      expect(norm).toContain("onclick@button.tsx:12");
      expect(norm).toContain("dispatchevent@index.js:104");
    });

    it("should strip bundle build hashes from filenames to keep fingerprints stable across releases", () => {
      const stack1 = "at render (http://static.com/chunks/main.a1b2c3d4.js:55:12)";
      const stack2 = "at render (http://static.com/chunks/main-e5f6g7h8.js:55:12)";
      
      expect(normalizeError("err", stack1)).toBe(normalizeError("err", stack2));
      expect(normalizeError("err", stack1)).toContain("render@main.js:55");
    });

    it("should fallback to message-only normalizer when stack trace is absent or unparseable", () => {
      const msg = "TypeError: null is not an object";
      expect(normalizeError(msg, "")).toBe("typeerror: null is not an object");
      expect(normalizeError(msg, "invalid stack line")).toBe("typeerror: null is not an object");
    });
  });

  describe("generateFingerprint End-to-End Stability", () => {
    
    it("should generate stable SHA-256 fingerprints for equivalent js_errors", () => {
      const event1: SummaryEvent = {
        type: "js_error",
        timestampMs: 1622000000000,
        errorMessage: "Cannot read property 'foo' of undefined",
        errorStack: "at showDetail (http://app.com/main.a1b2c3d4.js:10:5)\nat process (http://app.com/main.a1b2c3d4.js:20:8)"
      };
      
      const event2: SummaryEvent = {
        type: "js_error",
        timestampMs: 1622000010000, // different timestamp
        errorMessage: "Cannot read property 'foo' of undefined",
        errorStack: "at showDetail (http://app.com/main.e5f6g7h8.js:10:9)\nat process (http://app.com/main.e5f6g7h8.js:20:12)" // shifted column/hash
      };

      const fp1 = generateFingerprint(event1);
      const fp2 = generateFingerprint(event2);
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it("should produce distinct fingerprints for different JS errors", () => {
      const event1: SummaryEvent = {
        type: "js_error",
        timestampMs: 1622000000000,
        errorMessage: "Cannot read property 'foo' of undefined",
        errorStack: "at showDetail (http://app.com/main.js:10:5)"
      };
      const event2: SummaryEvent = {
        type: "js_error",
        timestampMs: 1622000000000,
        errorMessage: "Network request failed",
        errorStack: "at fetchResource (http://app.com/main.js:42:5)"
      };

      expect(generateFingerprint(event1)).not.toBe(generateFingerprint(event2));
    });

    it("should collapse network URL errors with different query parameters or dynamic path segments", () => {
      const event1: SummaryEvent = {
        type: "network_error",
        timestampMs: 1622000000000,
        networkUrl: "http://api.com/v1/users/4932/profile?refresh=true",
        networkMethod: "GET",
        networkStatus: 404
      };
      const event2: SummaryEvent = {
        type: "network_error",
        timestampMs: 1622000100000,
        networkUrl: "http://api.com/v1/users/8321/profile?refresh=false",
        networkMethod: "GET",
        networkStatus: 404
      };

      expect(generateFingerprint(event1)).toBe(generateFingerprint(event2));
    });

    it("should produce distinct fingerprints for different HTTP status codes or methods", () => {
      const eventBase: SummaryEvent = {
        type: "network_error",
        timestampMs: 1622000000000,
        networkUrl: "http://api.com/v1/users/4932/profile",
        networkMethod: "GET",
        networkStatus: 404
      };
      
      const eventDiffStatus = { ...eventBase, networkStatus: 500 };
      const eventDiffMethod = { ...eventBase, networkMethod: "POST" };

      const fpBase = generateFingerprint(eventBase);
      expect(generateFingerprint(eventDiffStatus)).not.toBe(fpBase);
      expect(generateFingerprint(eventDiffMethod)).not.toBe(fpBase);
    });

    it("should separate rage clicks on different pages", () => {
      const clickEvent: SummaryEvent = {
        type: "rage_click",
        timestampMs: 1622000000000,
        target: "button#submit-btn"
      };

      const fpPageA = generateFingerprint(clickEvent, "http://app.com/checkout");
      const fpPageB = generateFingerprint(clickEvent, "http://app.com/settings");

      expect(fpPageA).not.toBe(fpPageB);
    });

    it("should collapse navigation events on the same route path", () => {
      const nav1: SummaryEvent = {
        type: "navigation",
        timestampMs: 1622000000000,
        navTo: "/dashboard?user=123"
      };
      const nav2: SummaryEvent = {
        type: "navigation",
        timestampMs: 1622000000000,
        navTo: "/dashboard?user=999"
      };

      expect(generateFingerprint(nav1)).toBe(generateFingerprint(nav2));
    });

    it("should ensure Event ID and Fingerprint are completely distinct semantically", () => {
      const event: SummaryEvent = {
        type: "js_error",
        timestampMs: 1622000000000,
        errorMessage: "TypeError: fail",
        errorStack: "at run (http://app.com/main.js:10:5)"
      };

      // Ingest event ID hash format: [sessionId]:[type]:[timestampMs]:[stableExtra]
      const sessionId = "sess_123";
      const stableExtra = "TypeError: fail:at run (http://app.com/main.js:10:5)";
      const hashInput = `${sessionId}:${event.type}:${event.timestampMs}:${stableExtra}`;
      const eventId = crypto.createHash("sha256").update(hashInput).digest("hex");

      const fingerprint = generateFingerprint(event);

      // Event ID has sessionId and timestampMs embedded; fingerprint is context-free
      expect(eventId).not.toBe(fingerprint);
      
      // Retrying with different session/timestamp shifts Event ID, but leaves fingerprint stable
      const event2 = { ...event, timestampMs: 1622055500000 };
      const hashInput2 = `sess_999:${event2.type}:${event2.timestampMs}:${stableExtra}`;
      const eventId2 = crypto.createHash("sha256").update(hashInput2).digest("hex");
      const fingerprint2 = generateFingerprint(event2);

      expect(eventId).not.toBe(eventId2); // Event IDs differ
      expect(fingerprint).toBe(fingerprint2); // Fingerprint remains stable
    });
  });
});
