import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupDeadClickCapture } from "../detectors/dead-click-detector";
import type { NavigationCallback } from "../detectors/navigation-observer";
import type { SummaryEvent } from "../types";

describe("dead click detector", () => {
  let summaryEvents: SummaryEvent[];
  let triggerClick: (x: number, y: number, target?: any) => void;
  let triggerMutation: () => void;
  let triggerNavActivity: NavigationCallback;
  let observeMock: any;
  let disconnectMock: any;

  beforeEach(() => {
    summaryEvents = [];
    vi.useFakeTimers();

    let clickHandler: any;
    vi.stubGlobal("document", {
      documentElement: {},
      addEventListener: vi.fn((event, handler) => {
        if (event === "click") clickHandler = handler;
      }),
      removeEventListener: vi.fn(),
    });

    observeMock = vi.fn();
    disconnectMock = vi.fn();

    class MockMutationObserver {
      callback: Function;
      constructor(cb: Function) {
        this.callback = cb;
        triggerMutation = () => this.callback();
      }
      observe = observeMock;
      disconnect = disconnectMock;
    }

    vi.stubGlobal("MutationObserver", MockMutationObserver);

    // We stub window to provide standard DOM timing globals and listeners
    vi.stubGlobal("window", {
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    triggerNavActivity = () => {};

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

  it("triggers dead click if no activity occurs within timeout", () => {
    setupDeadClickCapture({
      summaryEvents,
      debug: false,
      onNavigation: (cb: NavigationCallback) => {
        triggerNavActivity = cb;
        return () => {};
      },
    });

    triggerClick(100, 100);
    expect(summaryEvents).toHaveLength(0);

    // Advance past the 500ms threshold
    vi.advanceTimersByTime(600);

    expect(summaryEvents).toHaveLength(1);
    const event = summaryEvents[0]!;
    expect(event.type).toBe("dead_click");
    expect(event.x).toBe(100);
    expect(event.y).toBe(100);
    expect(event.waitTimeMs).toBe(500);
  });

  it("does not trigger dead click if DOM mutates", () => {
    setupDeadClickCapture({
      summaryEvents,
      onNavigation: (cb: NavigationCallback) => {
        triggerNavActivity = cb;
        return () => {};
      },
    });

    triggerClick(100, 100);

    // Simulate React/UI updating the DOM 200ms after the click
    vi.advanceTimersByTime(200);
    triggerMutation();

    // Advance past the threshold
    vi.advanceTimersByTime(400);

    expect(summaryEvents).toHaveLength(0);
  });

  it("does not trigger dead click if navigation activity occurs", () => {
    setupDeadClickCapture({
      summaryEvents,
      onNavigation: (cb: NavigationCallback) => {
        triggerNavActivity = cb;
        return () => {};
      },
    });

    triggerClick(100, 100);

    // Simulate SPA route change via navigation observer subscription
    vi.advanceTimersByTime(100);
    triggerNavActivity("pushState");

    // Advance past the threshold
    vi.advanceTimersByTime(500);

    expect(summaryEvents).toHaveLength(0);
  });

  it("prevents duplicate dead clicks within cooldown period", () => {
    setupDeadClickCapture({
      summaryEvents,
      onNavigation: (cb: NavigationCallback) => {
        triggerNavActivity = cb;
        return () => {};
      },
    });

    // Click 1
    triggerClick(100, 100);
    // Click 2 (spam)
    vi.advanceTimersByTime(100);
    triggerClick(100, 100);

    // Advance past threshold for both
    vi.advanceTimersByTime(600);

    // Only one dead click should be emitted due to cooldown
    expect(summaryEvents).toHaveLength(1);
  });

  it("connects and disconnects MutationObserver dynamically to save CPU", () => {
    setupDeadClickCapture({
      summaryEvents,
      onNavigation: (cb: NavigationCallback) => {
        triggerNavActivity = cb;
        return () => {};
      },
    });

    expect(observeMock).not.toHaveBeenCalled();

    triggerClick(100, 100);
    expect(observeMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);

    // Once queue is empty, it should disconnect
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("captures element metadata safely", () => {
    setupDeadClickCapture({
      summaryEvents,
      onNavigation: (cb: NavigationCallback) => {
        triggerNavActivity = cb;
        return () => {};
      },
    });

    const mockTarget = {
      tagName: "DIV",
      id: "broken-btn",
      className: "btn disabled",
    };

    triggerClick(50, 50, mockTarget);
    vi.advanceTimersByTime(600);

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.target).toEqual({
      tagName: "div",
      id: "broken-btn",
      className: "btn disabled",
    });
  });

  it("cleans up listeners and timers on teardown", () => {
    const unsubscribe = vi.fn();
    const teardown = setupDeadClickCapture({
      summaryEvents,
      onNavigation: (cb: NavigationCallback) => {
        triggerNavActivity = cb;
        return unsubscribe;
      },
    });
    expect(document.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      { passive: true, capture: true },
    );

    triggerClick(100, 100); // starts a timer

    teardown();
    expect(document.removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      { capture: true },
    );
    expect(disconnectMock).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalled();

    // Fast forward to prove timer was cleared (if it wasn't, evaluateClick would throw or add an event)
    vi.advanceTimersByTime(600);
    expect(summaryEvents).toHaveLength(0);
  });
});
