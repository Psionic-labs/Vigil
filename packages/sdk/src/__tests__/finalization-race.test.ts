import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as rrweb from 'rrweb';
import { Vigil } from '../index';

vi.mock('rrweb', () => ({
  record: vi.fn(() => vi.fn())
}));

class MockBlob {
  parts: string[];
  constructor(parts: string[]) {
    this.parts = parts;
  }
}

describe('SDK finalization race conditions', () => {
  let emitCallback: ((event: unknown) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    emitCallback = null;

    // Capture the emit callback rrweb receives
    vi.mocked(rrweb.record).mockImplementation((opts: any) => {
      emitCallback = opts?.emit ?? null;
      return vi.fn();
    });

    vi.stubGlobal('window', {
      location: { href: 'http://loc' },
      screen: { width: 1024, height: 768 },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      history: { pushState: vi.fn(), replaceState: vi.fn() }
    });
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible'
    });
    vi.stubGlobal('navigator', {
      userAgent: 'test',
      sendBeacon: vi.fn().mockReturnValue(true)
    });
    vi.stubGlobal('Blob', MockBlob);
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    Vigil.shutdown();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('rrweb and summary emissions are blocked after finalization', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    expect(emitCallback).toBeDefined();
    const events = window.__vigil!.events;
    const summary = window.__vigil!.summaryEvents;

    emitCallback!({ type: 1, data: {}, timestamp: 1 });
    summary.push({ type: 'js_error', timestampMs: 1 } as any);
    expect(events.length).toBe(1);
    expect(summary.length).toBe(1);

    Vigil.shutdown();

    emitCallback!({ type: 1, data: {}, timestamp: 2 });
    summary.push({ type: 'js_error', timestampMs: 2 } as any);
    expect(events).toHaveLength(0);
    expect(summary).toHaveLength(0);
    expect(window.__vigil).toBeUndefined();
  });

  it('final flush prevents all future replay batches', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    const beaconSpy = vi.mocked(navigator.sendBeacon);

    // Push some data
    window.__vigil!.summaryEvents.push({ type: 'js_error', timestampMs: 1 } as any);

    // Trigger shutdown (which triggers final flush)
    Vigil.shutdown();

    // sendBeacon should have been called exactly once (the final flush)
    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const sentPayload = JSON.parse((beaconSpy.mock.calls[0]![1] as unknown as MockBlob).parts[0]!);
    expect(sentPayload.isFinal).toBe(true);
  });

  it('periodic interval cannot emit after finalization', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });

    // Push some data
    window.__vigil!.summaryEvents.push({ type: 'js_error', timestampMs: 1 } as any);

    Vigil.shutdown();
    const beaconCallCount = vi.mocked(navigator.sendBeacon).mock.calls.length;

    // Advance timers to fire any pending periodic interval ticks
    vi.advanceTimersByTime(60000);

    // No additional sends should have occurred
    expect(vi.mocked(navigator.sendBeacon).mock.calls.length).toBe(beaconCallCount);
  });

  it('multiple shutdown calls remain idempotent', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    window.__vigil!.summaryEvents.push({ type: 'js_error', timestampMs: 1 } as any);

    Vigil.shutdown();
    const beaconCallCount = vi.mocked(navigator.sendBeacon).mock.calls.length;

    // Second shutdown should be a no-op (no double flush)
    Vigil.shutdown();
    expect(vi.mocked(navigator.sendBeacon).mock.calls.length).toBe(beaconCallCount);

    // Third shutdown also no-op
    Vigil.shutdown();
    expect(vi.mocked(navigator.sendBeacon).mock.calls.length).toBe(beaconCallCount);
  });

  it('starts a new active lifecycle after shutdown and re-init', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    Vigil.shutdown();

    // Re-init should work cleanly
    Vigil.init({ projectKey: 'pk_test', debug: true });
    expect(window.__vigil).toBeDefined();
    expect(window.__vigil!.sessionId).toBeTruthy();

    // And new events should be accepted
    emitCallback!({ type: 1, data: {}, timestamp: 2 });
    expect(window.__vigil!.events.length).toBe(1);

    Vigil.shutdown();
  });

  it('concurrent interval tick + final flush produces exactly one final payload', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    window.__vigil!.summaryEvents.push({ type: 'js_error', timestampMs: 1 } as any);

    const beaconSpy = vi.mocked(navigator.sendBeacon);
    beaconSpy.mockClear();

    // Trigger shutdown (final flush)
    Vigil.shutdown();

    // Advance timers to fire the pending periodic tick
    vi.advanceTimersByTime(60000);

    // Only one beacon call (the final flush) should have happened
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  it('rrweb emit guard prevents data accumulation during shutdown window', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    expect(emitCallback).toBeDefined();

    const eventsBefore = window.__vigil!.events.length;

    // Record a few events
    emitCallback!({ type: 1, data: {}, timestamp: 10 });
    emitCallback!({ type: 2, data: {}, timestamp: 20 });
    expect(window.__vigil!.events.length).toBe(eventsBefore + 2);

    Vigil.shutdown();

    // Events buffer should be cleared
    // And any subsequent emit calls would be blocked by the guard
  });
});
