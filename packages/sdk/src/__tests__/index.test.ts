import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as rrweb from 'rrweb';

vi.mock('rrweb', () => ({
  record: vi.fn()
}));

describe('SDK init', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { 
      location: { href: 'http://loc' }, 
      screen: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', { userAgent: 'test' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('swallows rrweb initialization errors and continues setup in summary-only mode', async () => {
    vi.mocked(rrweb.record).mockImplementationOnce(() => {
      throw new Error('Strict Cross-Origin DOM Exception');
    });
    
    const { init } = await import('../index');

    // Should not throw and crash host application
    expect(() => {
      init({ projectKey: 'pk_test', debug: true });
    }).not.toThrow();

    // Verify it still attached the debug object meaning initialization finished successfully
    expect((globalThis as any).window.__vigil).toBeDefined();
    expect((globalThis as any).window.__vigil.summaryEvents).toBeDefined();
  });

  it('drops oldest events when buffer limits are exceeded to prevent OOM', async () => {
    let emitEvent: any;
    vi.mocked(rrweb.record).mockImplementationOnce((options: any) => {
      emitEvent = options.emit;
      return () => {};
    });

    const { init } = await import('../index');
    init({ projectKey: 'pk_test', debug: true });

    const vigil = (globalThis as any).window.__vigil;

    // Push 6000 rrweb events
    for (let i = 0; i < 6000; i++) {
      emitEvent({ type: i });
    }

    // Max is 5000, so it should have trimmed gracefully
    expect(vigil.events.length).toBeLessThanOrEqual(5000);

    // Push 1500 summary events
    for (let i = 0; i < 1500; i++) {
      vigil.summaryEvents.push({ type: 'js_error', timestampMs: i });
    }

    // Max is 1000, so it should have trimmed gracefully
    expect(vigil.summaryEvents.length).toBeLessThanOrEqual(1000);
  });
  
  it('enforces privacy masking on rrweb by default', async () => {
    const { init } = await import('../index');
    init({ projectKey: 'pk_test' });

    expect(rrweb.record).toHaveBeenCalledTimes(1);
    const options = vi.mocked(rrweb.record).mock.calls[0]![0] as any;
    
    // Privacy by default must be strictly enforced!
    expect(options.maskAllInputs).toBe(true);
  });
});
