import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupSignificantClickCapture } from "../detectors/significant-click-detector";
import type { SummaryEvent } from "../types";

describe("significant click detector", () => {
  let summaryEvents: SummaryEvent[];
  let triggerClick: (target: any, x?: number, y?: number) => void;

  beforeEach(() => {
    summaryEvents = [];
    vi.useFakeTimers();

    let clickHandler: any;

    vi.stubGlobal("document", {
      addEventListener: vi.fn((_event: string, handler: any) => {
        clickHandler = handler;
      }),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    triggerClick = (target: any, x = 100, y = 100) => {
      clickHandler({
        clientX: x,
        clientY: y,
        target,
      });
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Element matching

  it("captures clicks on <button> elements", () => {
    setupSignificantClickCapture({ summaryEvents });

    const btn = mockElement("BUTTON", { id: "submit-btn" });
    triggerClick(btn);

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.type).toBe("click");
    expect((summaryEvents[0]!.target as any).tagName).toBe("button");
    expect((summaryEvents[0]!.target as any).id).toBe("submit-btn");
  });

  it("captures clicks on <a> elements with sanitized href", () => {
    setupSignificantClickCapture({ summaryEvents });

    const link = mockElement("A", {
      id: "nav-link",
      href: "https://example.com/page?token=secret#hash",
    });
    triggerClick(link);

    expect(summaryEvents).toHaveLength(1);
    const target = summaryEvents[0]!.target as any;
    expect(target.tagName).toBe("a");
    expect(target.href).toBe("https://example.com/page");
  });

  it("captures clicks on elements with role='button'", () => {
    setupSignificantClickCapture({ summaryEvents });

    const div = mockElement("DIV", { role: "button", id: "custom-btn" });
    triggerClick(div);

    expect(summaryEvents).toHaveLength(1);
    const target = summaryEvents[0]!.target as any;
    expect(target.tagName).toBe("div");
    expect(target.role).toBe("button");
  });

  // Nested click delegation

  it("resolves nested clicks to the closest interactive ancestor", () => {
    setupSignificantClickCapture({ summaryEvents });

    // An <svg> icon nested inside a <button>
    const button = mockElement("BUTTON", { id: "icon-btn" });
    const svg = mockElement("SVG", {}, button);
    triggerClick(svg);

    expect(summaryEvents).toHaveLength(1);
    expect((summaryEvents[0]!.target as any).tagName).toBe("button");
    expect((summaryEvents[0]!.target as any).id).toBe("icon-btn");
  });

  // Non-interactive filtering

  it("ignores clicks on non-interactive elements", () => {
    setupSignificantClickCapture({ summaryEvents });

    const div = mockElement("DIV", {}); // no role, not a button/anchor
    triggerClick(div);

    expect(summaryEvents).toHaveLength(0);
  });

  it("ignores clicks on body/layout containers", () => {
    setupSignificantClickCapture({ summaryEvents });

    const section = mockElement("SECTION", {});
    triggerClick(section);

    expect(summaryEvents).toHaveLength(0);
  });

  // Throttling / deduplication

  it("throttles rapid repeated clicks on the same element", () => {
    setupSignificantClickCapture({ summaryEvents });

    const btn = mockElement("BUTTON", { id: "rapid-btn" });

    triggerClick(btn);
    triggerClick(btn); // within 300ms
    triggerClick(btn); // within 300ms

    expect(summaryEvents).toHaveLength(1);
  });

  it("allows clicks after throttle window expires", () => {
    setupSignificantClickCapture({ summaryEvents });

    const btn = mockElement("BUTTON", { id: "delayed-btn" });

    triggerClick(btn);
    expect(summaryEvents).toHaveLength(1);

    vi.advanceTimersByTime(400); // past 300ms throttle
    triggerClick(btn);
    expect(summaryEvents).toHaveLength(2);
  });

  it("does not throttle clicks on different elements", () => {
    setupSignificantClickCapture({ summaryEvents });

    const btn1 = mockElement("BUTTON", { id: "btn-1" });
    const btn2 = mockElement("BUTTON", { id: "btn-2" });

    triggerClick(btn1);
    triggerClick(btn2);

    expect(summaryEvents).toHaveLength(2);
  });

  // Privacy

  it("truncates long classNames", () => {
    setupSignificantClickCapture({ summaryEvents });

    const longClass = "a".repeat(300);
    const btn = mockElement("BUTTON", { className: longClass });
    triggerClick(btn);

    expect(summaryEvents).toHaveLength(1);
    expect((summaryEvents[0]!.target as any).className.length).toBe(200);
  });

  it("does not capture text content or innerHTML", () => {
    setupSignificantClickCapture({ summaryEvents });

    const btn = mockElement("BUTTON", {
      id: "text-btn",
      textContent: "Click me for secrets",
      innerHTML: "<span>secret</span>",
    });
    triggerClick(btn);

    expect(summaryEvents).toHaveLength(1);
    const target = summaryEvents[0]!.target as any;
    expect(target.textContent).toBeUndefined();
    expect(target.innerHTML).toBeUndefined();
  });

  // Coordinates

  it("captures click coordinates", () => {
    setupSignificantClickCapture({ summaryEvents });

    const btn = mockElement("BUTTON", {});
    triggerClick(btn, 42, 84);

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.x).toBe(42);
    expect(summaryEvents[0]!.y).toBe(84);
  });

  // Cleanup

  it("removes listener on teardown", () => {
    const teardown = setupSignificantClickCapture({ summaryEvents });

    expect(document.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      { passive: true, capture: true },
    );

    teardown();

    expect(document.removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      { capture: true },
    );
  });
});

// Test helpers

/**
 * Create a minimal mock HTMLElement that supports `.closest()` for
 * the significant click detector's delegation logic.
 *
 * `parent` simulates nesting (e.g. <svg> inside <button>).
 */
function mockElement(
  tagName: string,
  attrs: Record<string, string>,
  parent?: any,
): any {
  const el: any = {
    tagName,
    id: attrs.id || "",
    className: attrs.className || "",
    textContent: attrs.textContent || "",
    innerHTML: attrs.innerHTML || "",
    href: attrs.href || "",
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    closest(selector: string) {
      // Walk the mock chain: check self, then parent
      if (matchesSelector(el, selector)) return el;
      if (parent) return parent.closest?.(selector) ?? (matchesSelector(parent, selector) ? parent : null);
      return null;
    },
  };

  return el;
}

/** Minimal selector matching for test mocks. */
function matchesSelector(el: any, selector: string): boolean {
  const selectors = selector.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    if (sel.startsWith("[")) {
      // Attribute selector like [role="button"]
      const match = sel.match(/\[(\w+)="([^"]+)"\]/);
      if (match && el.getAttribute(match[1]!) === match[2]) return true;
    } else {
      // Tag selector like 'a' or 'button'
      if (el.tagName.toLowerCase() === sel.toLowerCase()) return true;
    }
  }
  return false;
}
