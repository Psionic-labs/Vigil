import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupConsoleCapture } from '../console';
import type { SummaryEvent } from '../types';

describe('console.error capture', () => {
  let summaryEvents: SummaryEvent[];
  let nativeConsoleError: typeof console.error;
  let consoleSpy: any;

  beforeEach(() => {
    // Mock window to bypass SSR guard for standard tests
    (globalThis as any).window = {};

    summaryEvents = [];
    nativeConsoleError = console.error;
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore any mocked or patched console.error
    console.error = nativeConsoleError;
    vi.restoreAllMocks();
  });

  it('preserves native console.error behavior and receives original arguments', () => {
    const removeCapture = setupConsoleCapture({ summaryEvents });
    
    console.error('Test message', { data: 123 });

    // Ensure the original (mocked) function was called correctly via the spy
    expect(consoleSpy).toHaveBeenCalledWith('Test message', { data: 123 });
    
    removeCapture();
  });

  it('normalizes functions and symbols properly without throwing', () => {
    const removeCapture = setupConsoleCapture({ summaryEvents });

    const sym = Symbol('test-symbol');
    const func = () => 'test-func';

    console.error(sym, func);

    expect(summaryEvents).toHaveLength(1);
    expect(summaryEvents[0]!.argumentSummaries).toEqual([
      'Symbol(test-symbol)',
      func.toString()
    ]);

    removeCapture();
  });

  it('does not double patch on repeated initialization', () => {
    const remove1 = setupConsoleCapture({ summaryEvents });
    const consoleAfterFirst = console.error;

    const remove2 = setupConsoleCapture({ summaryEvents });
    const consoleAfterSecond = console.error;

    expect(consoleAfterFirst).toBe(consoleAfterSecond);

    remove1();
    remove2();
  });

  it('tears down idempotently and safely restores the original', () => {
    const beforePatch = console.error;
    const removeCapture = setupConsoleCapture({ summaryEvents });

    expect(console.error).not.toBe(beforePatch);
    
    removeCapture();
    expect(console.error).toBe(beforePatch);
  });

  it('leaves console.error untouched if another library wraps it after Vigil', () => {
    const beforePatch = console.error;
    const removeCapture = setupConsoleCapture({ summaryEvents });

    const vigilPatch = console.error;
    
    // Simulate another library wrapping Vigil
    const otherLibraryPatch = function(...args: any[]) {
      vigilPatch.apply(console, args);
    };
    console.error = otherLibraryPatch;

    // Trigger teardown
    removeCapture();

    // The current console.error should still be the other library's patch, not restored
    expect(console.error).toBe(otherLibraryPatch);

    // Cleanup for next test
    console.error = beforePatch;
  });

  it('distinguishes duplicates using both message and argument summaries', () => {
    const removeCapture = setupConsoleCapture({ summaryEvents });

    console.error('API Error', { status: 500 });
    console.error('API Error', { status: 401 }); // Different arg, should not be deduped
    console.error('API Error', { status: 500 }); // Same arg, should be deduped

    expect(summaryEvents).toHaveLength(2);
    expect(summaryEvents[0]!.argumentSummaries).toContain('{"status":500}');
    expect(summaryEvents[1]!.argumentSummaries).toContain('{"status":401}');

    removeCapture();
  });

  it('bounds dedupe cache memory safely', () => {
    const removeCapture = setupConsoleCapture({ summaryEvents });

    for (let i = 0; i < 55; i++) {
      console.error(`Error ${i}`);
    }

    // Since max is 50, it clears at 50, then records the next 5.
    // Total events pushed = 55 unique messages
    expect(summaryEvents).toHaveLength(55);

    // Verify duplicates are still caught within the new bounded set
    console.error('Error 54');
    expect(summaryEvents).toHaveLength(55); // Deduped!

    removeCapture();
  });

  it('is SSR safe', () => {
    // Temporarily remove window
    const originalWindow = (globalThis as any).window;
    // @ts-ignore
    delete (globalThis as any).window;

    const removeCapture = setupConsoleCapture({ summaryEvents });
    expect(summaryEvents).toHaveLength(0); // Setup should silently abort

    removeCapture();

    // @ts-ignore
    (globalThis as any).window = originalWindow;
  });

  it('never recursively crashes if SDK internals throw', () => {
    // Mock the summaryEvents.push to aggressively throw an error and call console.error
    const evilEvents = [] as any;
    evilEvents.push = () => {
      console.error("Internal SDK error"); // This would cause a crash loop
      throw new Error("Push failed");
    };

    const removeCapture = setupConsoleCapture({ summaryEvents: evilEvents });

    // If recursion protection works, this will not throw a stack overflow.
    // It will just swallow the internal push failure.
    expect(() => {
      console.error("Initial error");
    }).not.toThrow();

    // The spy should have been called TWICE.
    // Once for "Initial error", once for "Internal SDK error".
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    removeCapture();
  });
});
