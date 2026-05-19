import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupFinalFlush, type FlushContext } from '../flush';

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
    setupFinalFlush(ctx, mockTimer);
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
    setupFinalFlush(ctx, mockTimer);
    
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
    setupFinalFlush(ctx, mockTimer);
    pagehide();

    const mockBlob = (globalThis as any).navigator.sendBeacon.mock.calls[0]![1] as MockBlob;
    const sentPayload = JSON.parse(mockBlob.parts[0]!);

    // Query parameters should be stripped
    expect(sentPayload.metadata.url).toBe('https://example.com/path');
  });
});
