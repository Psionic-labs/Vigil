import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupRageClickCapture } from "../detectors/rage-click-detector";
import type { SummaryEvent } from "../types";

describe("rage click detector", () => {
  let summaryEvents: SummaryEvent[];
  let triggerClick: (x: number, y: number, target?: any) => void;

  beforeEach(() => {
    summaryEvents = [];
    vi.useFakeTimers();

    let clickHandler: any;
    vi.stubGlobal("document", {
      addEventListener: vi.fn((event, handler) => {
        if (event === "click") clickHandler = handler;
      }),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("window", {});

    triggerClick = (x: number, y: number, target: any = {}) => {
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

  it("triggers rage click on 3 rapid clicks in a small area", () => {
    setupRageClickCapture({ summaryEvents, debug: false });

    triggerClick(100, 100);
    vi.advanceTimersByTime(100);
    triggerClick(105, 105);
    vi.advanceTimersByTime(100);
    triggerClick(110, 110);

    expect(summaryEvents).toHaveLength(1);
    const event = summaryEvents[0]!;
    expect(event.type).toBe("rage_click");
    expect(event.clickCount).toBe(3);
    expect(event.area).toEqual({
      minX: 100,
      maxX: 110,
      minY: 100,
      maxY: 110,
    });
  });

  it("does not trigger if clicks are spread too far apart", () => {
    setupRageClickCapture({ summaryEvents });

    triggerClick(100, 100);
    vi.advanceTimersByTime(100);
    triggerClick(105, 105);
    vi.advanceTimersByTime(100);
    triggerClick(700, 700); // 600px away, exceeds 500px threshold

    expect(summaryEvents).toHaveLength(0);
  });

  it("does not trigger if clicks are too slow", () => {
    setupRageClickCapture({ summaryEvents });

    triggerClick(100, 100);
    vi.advanceTimersByTime(1500);
    triggerClick(105, 105);
    vi.advanceTimersByTime(1500); // Now 3000ms total since first click
    triggerClick(110, 110);

    // Because the window is 2000ms, the first click should be trimmed
    expect(summaryEvents).toHaveLength(0);
  });

  it("enforces a 3-second cooldown after a rage click", () => {
    setupRageClickCapture({ summaryEvents });

    // First burst
    triggerClick(100, 100);
    triggerClick(105, 105);
    triggerClick(110, 110);
    expect(summaryEvents).toHaveLength(1);

    vi.advanceTimersByTime(1000);

    // Second burst during cooldown (should be ignored)
    triggerClick(100, 100);
    triggerClick(105, 105);
    triggerClick(110, 110);
    expect(summaryEvents).toHaveLength(1);

    vi.advanceTimersByTime(2500); // Total 3500ms since last rage click

    // Third burst after cooldown (should trigger)
    triggerClick(100, 100);
    triggerClick(105, 105);
    triggerClick(110, 110);
    expect(summaryEvents).toHaveLength(2);
  });

  it("captures element metadata safely", () => {
    setupRageClickCapture({ summaryEvents });

    const mockTarget = {
      tagName: "BUTTON",
      id: "submit-btn",
      className: "btn primary",
    };

    triggerClick(100, 100, mockTarget);
    triggerClick(100, 100, mockTarget);
    triggerClick(100, 100, mockTarget);

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.target).toEqual({
      tagName: "button",
      id: "submit-btn",
      className: "btn primary",
    });
  });

  it("removes listener on teardown", () => {
    const teardown = setupRageClickCapture({ summaryEvents });
    expect(document.addEventListener).toHaveBeenCalledWith("click", expect.any(Function), { passive: true, capture: true });

    teardown();
    expect(document.removeEventListener).toHaveBeenCalledWith("click", expect.any(Function), { capture: true });
  });
});
