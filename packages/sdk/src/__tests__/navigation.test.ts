import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupNavigationCapture } from "../detectors/navigation-observer";
import type { SummaryEvent } from "../types";

describe("navigation observer", () => {
  let summaryEvents: SummaryEvent[];
  let mockLocation: { href: string };

  beforeEach(() => {
    summaryEvents = [];
    vi.useFakeTimers();

    mockLocation = { href: "https://app.example.com/home" };

    vi.stubGlobal("window", {
      location: mockLocation,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
    });

    vi.stubGlobal("document", {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // pushState tracking

  it("emits navigation event on pushState", () => {
    setupNavigationCapture({ summaryEvents });

    // Simulate pushState changing the URL
    mockLocation.href = "https://app.example.com/dashboard";
    window.history.pushState({}, "", "/dashboard");

    expect(summaryEvents).toHaveLength(1);
    const event = summaryEvents[0]!;
    expect(event.type).toBe("navigation");
    expect(event.navigationType).toBe("pushState");
    expect(event.navFrom).toBe("https://app.example.com/home");
    expect(event.navTo).toBe("https://app.example.com/dashboard");
  });

  // replaceState tracking

  it("emits navigation event on replaceState", () => {
    setupNavigationCapture({ summaryEvents });

    mockLocation.href = "https://app.example.com/settings";
    window.history.replaceState({}, "", "/settings");

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.navigationType).toBe("replaceState");
    expect(summaryEvents[0]!.navTo).toBe("https://app.example.com/settings");
  });

  // popstate tracking

  it("emits navigation event on popstate", () => {
    // Simulate the browser's popstate event
    const popstateListeners: Function[] = [];
    (window.addEventListener as any).mockImplementation(
      (event: string, handler: Function) => {
        if (event === "popstate") popstateListeners.push(handler);
      },
    );

    const { cleanup } = setupNavigationCapture({ summaryEvents });

    mockLocation.href = "https://app.example.com/previous";
    for (const cb of popstateListeners) cb();

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.navigationType).toBe("popstate");
    expect(summaryEvents[0]!.navTo).toBe("https://app.example.com/previous");

    cleanup();
  });

  // Deduplication

  it("suppresses duplicate navigations within 50ms window", () => {
    setupNavigationCapture({ summaryEvents });

    // Next.js double-fires pushState
    mockLocation.href = "https://app.example.com/page";
    window.history.pushState({}, "", "/page");
    window.history.pushState({}, "", "/page");

    expect(summaryEvents).toHaveLength(1);
  });

  it("allows same-URL navigation after dedup window", () => {
    setupNavigationCapture({ summaryEvents });

    mockLocation.href = "https://app.example.com/page";
    window.history.pushState({}, "", "/page");

    vi.advanceTimersByTime(100); // past 50ms dedup

    window.history.pushState({}, "", "/page");
    // Still only 1: same URL as currentUrl, suppressed as no-op
    expect(summaryEvents).toHaveLength(1);
  });

  // Same-page suppression

  it("suppresses no-op navigations to the same URL", () => {
    setupNavigationCapture({ summaryEvents });

    // pushState to the same page (currentUrl hasn't changed)
    window.history.pushState({}, "", "/home");

    expect(summaryEvents).toHaveLength(0);
  });

  // URL sanitization

  it("sanitizes query params and hash from URLs", () => {
    setupNavigationCapture({ summaryEvents });

    mockLocation.href =
      "https://app.example.com/profile?token=secret&user=123#section";
    window.history.pushState({}, "", "/profile?token=secret&user=123#section");

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.navTo).toBe("https://app.example.com/profile");
    expect(summaryEvents[0]!.navTo).not.toContain("token");
    expect(summaryEvents[0]!.navTo).not.toContain("secret");
  });

  // Subscriber system

  it("notifies subscribers on navigation", () => {
    const { subscribe } = setupNavigationCapture({ summaryEvents });

    const callback = vi.fn();
    subscribe(callback);

    mockLocation.href = "https://app.example.com/new";
    window.history.pushState({}, "", "/new");

    expect(callback).toHaveBeenCalledWith("pushState");
  });

  it("allows unsubscribing", () => {
    const { subscribe } = setupNavigationCapture({ summaryEvents });

    const callback = vi.fn();
    const unsub = subscribe(callback);
    unsub();

    mockLocation.href = "https://app.example.com/new";
    window.history.pushState({}, "", "/new");

    expect(callback).not.toHaveBeenCalled();
  });

  it("isolates subscriber errors from event pipeline", () => {
    const { subscribe } = setupNavigationCapture({ summaryEvents });

    subscribe(() => {
      throw new Error("subscriber crash");
    });

    mockLocation.href = "https://app.example.com/new";
    // Should not throw and event should still be emitted
    expect(() => window.history.pushState({}, "", "/new")).not.toThrow();
    expect(summaryEvents).toHaveLength(1);
  });

  // Cleanup

  it("restores original history methods on cleanup", () => {
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;

    const { cleanup } = setupNavigationCapture({ summaryEvents });

    // After setup, history methods should be patched
    expect(window.history.pushState).not.toBe(originalPush);

    cleanup();

    // After cleanup, originals should be restored
    expect(window.history.pushState).toBe(originalPush);
    expect(window.history.replaceState).toBe(originalReplace);
  });

  it("removes event listeners on cleanup", () => {
    const { cleanup } = setupNavigationCapture({ summaryEvents });

    cleanup();

    expect(window.removeEventListener).toHaveBeenCalledWith(
      "popstate",
      expect.any(Function),
    );
    expect(window.removeEventListener).toHaveBeenCalledWith(
      "hashchange",
      expect.any(Function),
    );
  });

  it("does not restore history if another library wrapped after us", () => {
    const originalPush = window.history.pushState;

    const { cleanup } = setupNavigationCapture({ summaryEvents });

    // Simulate Sentry or another APM wrapping history after Vigil
    const sentryWrapped = vi.fn();
    window.history.pushState = sentryWrapped;

    cleanup();

    // Should NOT clobber Sentry's wrapper
    expect(window.history.pushState).toBe(sentryWrapped);
    expect(window.history.pushState).not.toBe(originalPush);
  });

  // Multiple navigations tracking from→to chain

  it("tracks sequential navigations with correct from→to chain", () => {
    setupNavigationCapture({ summaryEvents });

    mockLocation.href = "https://app.example.com/a";
    window.history.pushState({}, "", "/a");

    vi.advanceTimersByTime(100);

    mockLocation.href = "https://app.example.com/b";
    window.history.pushState({}, "", "/b");

    vi.advanceTimersByTime(100);

    mockLocation.href = "https://app.example.com/c";
    window.history.pushState({}, "", "/c");

    expect(summaryEvents).toHaveLength(3);
    expect(summaryEvents[0]!.navFrom).toBe("https://app.example.com/home");
    expect(summaryEvents[0]!.navTo).toBe("https://app.example.com/a");
    expect(summaryEvents[1]!.navFrom).toBe("https://app.example.com/a");
    expect(summaryEvents[1]!.navTo).toBe("https://app.example.com/b");
    expect(summaryEvents[2]!.navFrom).toBe("https://app.example.com/b");
    expect(summaryEvents[2]!.navTo).toBe("https://app.example.com/c");
  });
});
