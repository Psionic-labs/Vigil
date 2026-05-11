import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupNetworkCapture, NetworkCaptureContext } from '../network';

describe('Network Capture', () => {
  let ctx: NetworkCaptureContext;
  let teardown: () => void;
  let originalFetchMock: any;
  let originalXhrOpenMock: any;

  beforeEach(() => {
    ctx = { summaryEvents: [], endpoint: 'https://api.vigil.com/ingest' };
    
    // Mock fetch
    originalFetchMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', originalFetchMock);

    // Mock XHR
    class MockXHR {
      status = 0;
      readyState = 0;
      statusText = '';
      __mockStatus?: number;
      __mockStatusText?: string;
      onreadystatechange: any = null;
      listeners = new Set<any>();
      addEventListener(event: string, handler: any) {
        if (event === 'readystatechange') {
          this.listeners.add(handler);
          this.onreadystatechange = handler; // Fallback simulation
        }
      }
      removeEventListener(event: string, handler: any) {
        if (event === 'readystatechange') {
          this.listeners.delete(handler);
        }
      }
      open() {}
      send() {}
    }
    MockXHR.prototype.addEventListener = vi.fn(MockXHR.prototype.addEventListener);
    originalXhrOpenMock = vi.fn();
    MockXHR.prototype.open = originalXhrOpenMock;
    MockXHR.prototype.send = vi.fn(function(this: any) {
      setTimeout(() => {
        this.readyState = 4;
        this.status = this.__mockStatus || 200;
        this.statusText = this.__mockStatusText || 'OK';
        if (this.onreadystatechange) this.onreadystatechange();
        for (const handler of this.listeners) handler();
      }, 5);
    });
    vi.stubGlobal('XMLHttpRequest', MockXHR);
    vi.stubGlobal('window', { fetch: originalFetchMock });
    vi.stubGlobal('Request', class Request {
      url: string;
      method: string;
      constructor(url: string, init?: any) {
        this.url = url;
        this.method = init?.method || 'GET';
      }
    });

    teardown = setupNetworkCapture(ctx);
  });

  afterEach(() => {
    teardown();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('captures fetch 500 errors and sanitizes URL', async () => {
    originalFetchMock.mockResolvedValueOnce({
      status: 500,
      statusText: 'Internal Server Error',
    } as any);

    await (globalThis as any).window.fetch('https://example.com/api?secret=123', { method: 'POST' });

    expect(ctx.summaryEvents).toHaveLength(1);
    const event = ctx.summaryEvents[0] as any;
    expect(event.type).toBe('network_failure');
    expect(event.status).toBe(500);
    expect(event.method).toBe('POST');
    expect(event.url).toBe('https://example.com/api'); // Query params stripped
    expect(event.source).toBe('fetch');
  });

  it('ignores fetch 200 successes', async () => {
    await (globalThis as any).window.fetch('https://example.com/api');
    expect(ctx.summaryEvents).toHaveLength(0);
  });

  it('ignores fetch rejections (e.g. offline, DNS, CORS) per requirements', async () => {
    originalFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    
    try {
      await (globalThis as any).window.fetch('https://example.com/api');
    } catch (e) {}

    expect(ctx.summaryEvents).toHaveLength(0);
  });

  it('normalizes fetch inputs (URL, Request, string)', async () => {
    originalFetchMock.mockResolvedValue({ status: 404 } as any);

    await (globalThis as any).window.fetch(new URL('https://example.com/u'));
    await (globalThis as any).window.fetch(new (globalThis as any).Request('https://example.com/r', { method: 'DELETE' }));

    expect(ctx.summaryEvents).toHaveLength(2);
    expect((ctx.summaryEvents[0] as any).url).toBe('https://example.com/u');
    expect((ctx.summaryEvents[1] as any).url).toBe('https://example.com/r');
    expect((ctx.summaryEvents[1] as any).method).toBe('DELETE');
  });

  it('captures XHR 404 errors', async () => {
    return new Promise<void>((resolve) => {
      const xhr = new (globalThis as any).XMLHttpRequest();
      xhr.__mockStatus = 404;
      xhr.__mockStatusText = 'Not Found';

      xhr.open('PUT', 'https://example.com/xhr?q=1');
      xhr.send();

      setTimeout(() => {
        expect(ctx.summaryEvents).toHaveLength(1);
        const event = ctx.summaryEvents[0] as any;
        expect(event.type).toBe('network_failure');
        expect(event.status).toBe(404);
        expect(event.url).toBe('https://example.com/xhr');
        expect(event.source).toBe('xhr');
        resolve();
      }, 20);
    });
  });

  it('ignores SDK ingestion requests to prevent recursion loops', async () => {
    originalFetchMock.mockResolvedValueOnce({ status: 502 } as any);
    await (globalThis as any).window.fetch('https://api.vigil.com/ingest');
    expect(ctx.summaryEvents).toHaveLength(0);
  });

  it('deduplicates identical network errors rapidly fired', async () => {
    originalFetchMock.mockResolvedValue({ status: 500 } as any);

    await (globalThis as any).window.fetch('https://example.com/dedupe');
    await (globalThis as any).window.fetch('https://example.com/dedupe');
    await (globalThis as any).window.fetch('https://example.com/dedupe');

    // Should only record 1 due to short-term deduplication
    expect(ctx.summaryEvents).toHaveLength(1);
  });

  it('fetch Request method can be overridden by init, and query strings are stripped', async () => {
    originalFetchMock.mockResolvedValue({ status: 500 } as any);

    const req = new (globalThis as any).Request('https://example.com/req?secret=true', { method: 'PUT' });
    await (globalThis as any).window.fetch(req, { method: 'POST' });

    expect(ctx.summaryEvents).toHaveLength(1);
    const event = ctx.summaryEvents[0] as any;
    expect(event.method).toBe('POST');
    expect(event.url).toBe('https://example.com/req');
  });

  it('handles non-string fetch method safely without throwing', async () => {
    originalFetchMock.mockResolvedValue({ status: 500 } as any);

    await (globalThis as any).window.fetch('https://example.com/nonstring', { method: 123 as any });

    expect(ctx.summaryEvents).toHaveLength(1);
    expect((ctx.summaryEvents[0] as any).method).toBe('123');
  });

  it('ignores XHR network errors (status 0)', async () => {
    return new Promise<void>((resolve) => {
      const xhr = new (globalThis as any).XMLHttpRequest();
      xhr.__mockStatus = 0;

      xhr.open('GET', 'https://example.com/xhr-0');
      xhr.send();

      setTimeout(() => {
        expect(ctx.summaryEvents).toHaveLength(0);
        resolve();
      }, 20);
    });
  });

  it('stops reporting after teardown even if wrapped by another library', async () => {
    originalFetchMock.mockResolvedValue({ status: 500 } as any);

    const vigilWrapper = globalThis.window.fetch;
    globalThis.window.fetch = function(...args: any[]) {
      return vigilWrapper.apply(this, args);
    };

    teardown();

    await globalThis.window.fetch('https://example.com/teardown');
    expect(ctx.summaryEvents).toHaveLength(0);
  });

  it('reusing the same XHR instance does not leak listeners', async () => {
    return new Promise<void>((resolve) => {
      const xhr = new (globalThis as any).XMLHttpRequest();
      xhr.__mockStatus = 500;

      xhr.open('GET', 'https://example.com/reused');
      xhr.send();

      setTimeout(() => {
        expect(ctx.summaryEvents).toHaveLength(1);
        expect(xhr.listeners.size).toBe(0); // Listener removed!
        
        // Second request
        xhr.__mockStatus = 502; // Change status to bypass dedupe logic
        xhr.open('GET', 'https://example.com/reused-2');
        xhr.send();

        setTimeout(() => {
          expect(ctx.summaryEvents).toHaveLength(2);
          expect(xhr.listeners.size).toBe(0);
          resolve();
        }, 20);
      }, 20);
    });
  });

  it('safely restores native functionality on teardown', () => {
    teardown();
    
    expect(globalThis.window.fetch).toBe(originalFetchMock);
    expect(XMLHttpRequest.prototype.open).toBe(originalXhrOpenMock);
  });
});
