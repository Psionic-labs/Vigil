import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupFinalFlush, startFlushTimer, type FlushContext } from '../flush';

class MockBlob {
  parts: string[];
  constructor(parts: string[]) {
    this.parts = parts;
  }
}

describe('flush mechanics', () => {
  let ctx: FlushContext;

  beforeEach(() => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: 'https://example.com/path?secret=123' }
    });
    vi.stubGlobal('navigator', {
      sendBeacon: vi.fn().mockReturnValue(true)
    });
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible'
    });
    vi.stubGlobal('Blob', MockBlob);
    
    ctx = {
      sessionId: '123',
      projectKey: 'pk',
      endpoint: 'https://api.example.com',
      sdkVersion: '1',
      events: [],
      summaryEvents: [],
      metadata: {} as any,
      debug: false
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('trims massive rrweb events but preserves summary events when > 60KB', () => {
    // Generate massive rrweb events (~100KB)
    for (let i = 0; i < 1000; i++) {
      ctx.events.push({ type: 'massive', data: 'x'.repeat(100) });
    }
    // Add a summary event
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);

    let finalHandler: any;
    (globalThis as any).window.addEventListener.mockImplementation((name: string, handler: any) => {
      if (name === 'pagehide') finalHandler = handler;
    });

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    setupFinalFlush(ctx, mockTimer, mockState);
    finalHandler();

    expect((globalThis as any).navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const mockBlob = (globalThis as any).navigator.sendBeacon.mock.calls[0]![1] as MockBlob;
    const sentPayload = JSON.parse(mockBlob.parts[0]!);

    // Raw events should have been dropped to save the beacon
    expect(sentPayload.events).toEqual([]);
    // The critical summary event must be preserved!
    expect(sentPayload.summary).toHaveLength(1);
    expect(sentPayload.summary[0].type).toBe('js_error');
  });

  it('does not double-send if both pagehide and beforeunload fire', () => {
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);

    let pagehide: any, beforeunload: any;
    (globalThis as any).window.addEventListener.mockImplementation((name: string, handler: any) => {
      if (name === 'pagehide') pagehide = handler;
      if (name === 'beforeunload') beforeunload = handler;
    });

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    setupFinalFlush(ctx, mockTimer, mockState);
    
    pagehide();
    beforeunload();

    expect((globalThis as any).navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });
  
  it('updates metadata with sanitized URL on flush', () => {
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);

    let pagehide: any;
    (globalThis as any).window.addEventListener.mockImplementation((name: string, handler: any) => {
      if (name === 'pagehide') pagehide = handler;
    });

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    setupFinalFlush(ctx, mockTimer, mockState);
    pagehide();

    const mockBlob = (globalThis as any).navigator.sendBeacon.mock.calls[0]![1] as MockBlob;
    const sentPayload = JSON.parse(mockBlob.parts[0]!);

    // Query parameters should be stripped
    expect(sentPayload.metadata.url).toBe('https://example.com/path');
  });

  it('sends isFinal: true for unload flush and sets finalFlushSent', () => {
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);

    let pagehide: any;
    (globalThis as any).window.addEventListener.mockImplementation((name: string, handler: any) => {
      if (name === 'pagehide') pagehide = handler;
    });

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    setupFinalFlush(ctx, mockTimer, mockState);
    pagehide();

    const mockBlob = (globalThis as any).navigator.sendBeacon.mock.calls[0]![1] as MockBlob;
    const sentPayload = JSON.parse(mockBlob.parts[0]!);

    expect(sentPayload.isFinal).toBe(true);
    expect(mockState.finalFlushSent).toBe(true);
  });

  it('programmatic triggerFinalFlush sends isFinal: true', () => {
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    const finalFlush = setupFinalFlush(ctx, mockTimer, mockState);
    
    finalFlush.triggerFinalFlush();

    const mockBlob = (globalThis as any).navigator.sendBeacon.mock.calls[0]![1] as MockBlob;
    const sentPayload = JSON.parse(mockBlob.parts[0]!);

    expect(sentPayload.isFinal).toBe(true);
    expect(mockState.finalFlushSent).toBe(true);
  });

  it('prevents any future periodic flushes after a terminal flush attempt', async () => {
    const mockState = { finalFlushSent: false } as any;
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchSpy);

    ctx.events.push({ type: 'test' });
    const timer = startFlushTimer(ctx, 100, mockState);

    // Trigger terminal flush
    const finalFlush = setupFinalFlush(ctx, timer, mockState);
    finalFlush.triggerFinalFlush();

    // Now finalFlushSent is true and timer is stopped
    expect(mockState.finalFlushSent).toBe(true);
    
    // Clear fetch spy to reset count
    fetchSpy.mockClear();

    // Add new events to verify they are not flushed
    ctx.events.push({ type: 'another' });
    
    // Even if we wait, fetch should not be called again
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(fetchSpy).not.toHaveBeenCalled();
    
    timer.stop();
  });

  it('prevents retry restoration if a final flush occurs while a periodic flush is in-flight', async () => {
    const mockState = { finalFlushSent: false } as any;
    
    let resolveFetch: (value: any) => void = () => {};
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchSpy);

    ctx.events.push({ type: 'periodic-event' });
    
    vi.useFakeTimers();
    const timerFake = startFlushTimer(ctx, 100, mockState);
    
    // Advance time to trigger periodic flush tick
    vi.advanceTimersByTime(110);
    
    // The periodic flush is now in-flight
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    
    // Now trigger terminal flush
    const finalFlush = setupFinalFlush(ctx, timerFake, mockState);
    finalFlush.triggerFinalFlush();
    
    expect(mockState.finalFlushSent).toBe(true);
    
    // Now resolve the in-flight periodic flush with failure (ok: false)
    resolveFetch({ ok: false, status: 500, text: async () => 'Error' });
    
    // Run pending promise callbacks while staying on fake timers
    await vi.runAllTicks();
    
    // The events from the failed periodic flush should NOT be restored to the buffer
    // because state.finalFlushSent is true.
    expect(ctx.events).toEqual([]);
    
    timerFake.stop();
  });

  it('ignores future manual or automatic final flush attempts once finalized', () => {
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);
    
    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    const finalFlush = setupFinalFlush(ctx, mockTimer, mockState);
    
    // First trigger
    finalFlush.triggerFinalFlush();
    expect((globalThis as any).navigator.sendBeacon).toHaveBeenCalledTimes(1);
    expect(mockState.finalFlushSent).toBe(true);
    
    // Clear mock
    vi.mocked((globalThis as any).navigator.sendBeacon).mockClear();
    
    // Add more events
    ctx.summaryEvents.push({ type: 'another_error', timestampMs: 456 } as any);
    
    // Second trigger (should be ignored)
    finalFlush.triggerFinalFlush();
    expect((globalThis as any).navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it('duplicate unload and shutdown sequences still emit only one terminal payload', () => {
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);

    let pagehide: any, beforeunload: any;
    (globalThis as any).window.addEventListener.mockImplementation((name: string, handler: any) => {
      if (name === 'pagehide') pagehide = handler;
      if (name === 'beforeunload') beforeunload = handler;
    });

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    const finalFlush = setupFinalFlush(ctx, mockTimer, mockState);
    
    // Simulate pagehide, beforeunload, and programmatic trigger in quick succession
    pagehide();
    beforeunload();
    finalFlush.triggerFinalFlush();

    expect((globalThis as any).navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('triggers intermediate flush on visibilitychange hidden without setting isFinal: true and without draining buffers', () => {
    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);
    ctx.metadata = { url: 'https://example.com/initial' } as any;

    let visibilitychange: any;
    (globalThis as any).document.addEventListener.mockImplementation((name: string, handler: any) => {
      if (name === 'visibilitychange') visibilitychange = handler;
    });

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    setupFinalFlush(ctx, mockTimer, mockState);
    
    // Simulate visibility change to hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    visibilitychange();

    expect((globalThis as any).navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const mockBlob = (globalThis as any).navigator.sendBeacon.mock.calls[0]![1] as MockBlob;
    const sentPayload = JSON.parse(mockBlob.parts[0]!);

    // Should NOT be marked as final flush
    expect(sentPayload.isFinal).toBe(false);
    expect(mockState.finalFlushSent).toBe(false);
    
    // Timer should NOT be stopped
    expect(mockTimer.stop).not.toHaveBeenCalled();

    // Verify buffers were NOT drained (destructive drain would empty them)
    expect(ctx.summaryEvents.length).toBe(1);
    
    // Verify metadata isolation
    ctx.metadata.url = 'https://example.com/mutated';
    expect(sentPayload.metadata.url).not.toBe('https://example.com/mutated');
  });

  it('drops in-flight payload if lifecycleEpoch changes during await', async () => {
    const mockState = { finalFlushSent: false, lifecycleEpoch: 1 } as any;
    
    let resolveFetch: (value: any) => void = () => {};
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchSpy);

    ctx.events.push({ type: 'test-event' });
    
    vi.useFakeTimers();
    const timerFake = startFlushTimer(ctx, 100, mockState);
    
    // Advance time to trigger tick
    vi.advanceTimersByTime(110);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    
    // While in-flight, simulate shutdown/re-init bumping the epoch
    mockState.lifecycleEpoch = 2;
    
    // Resolve with failure
    resolveFetch({ ok: false, status: 500, text: async () => 'Error' });
    
    vi.useRealTimers();
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Events should NOT be restored because epoch changed
    expect(ctx.events).toEqual([]);
    
    timerFake.stop();
  });

  it('keepalive fetch fallback catches rejections to avoid unhandledrejection', async () => {
    // Force sendBeacon to fail so it falls back to fetch
    vi.mocked((globalThis as any).navigator.sendBeacon).mockReturnValue(false);
    
    const fetchSpy = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchSpy);

    ctx.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);

    let pagehide: any;
    (globalThis as any).window.addEventListener.mockImplementation((name: string, handler: any) => {
      if (name === 'pagehide') pagehide = handler;
    });

    const mockTimer = { stop: vi.fn(), getInFlight: vi.fn().mockReturnValue(null) };
    const mockState = { finalFlushSent: false } as any;
    setupFinalFlush(ctx, mockTimer, mockState);
    
    // Trigger the fetch fallback and explicitly observe the rejected promise.
    pagehide();
    
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(fetchSpy.mock.results[0]!.value).rejects.toThrow('Network error');
  });
});
