import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as rrweb from 'rrweb';
import { Vigil, init } from '../index';

vi.mock('rrweb', () => ({
  record: vi.fn(() => vi.fn())
}));

describe('SDK init behavior', () => {
  let warnSpy: any;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { 
      location: { href: 'http://loc' }, 
      screen: { width: 1024, height: 768 },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    vi.stubGlobal('navigator', { userAgent: 'test' });
    
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    Vigil.shutdown();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('prevents duplicate initialization', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    expect(rrweb.record).toHaveBeenCalledTimes(1);
    
    // Call init again (e.g. React StrictMode)
    Vigil.init({ projectKey: 'pk_test', debug: true });
    
    // rrweb should not be initialized a second time
    expect(rrweb.record).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already initialized'));
  });

  it('validates public API stability', () => {
    // Both Vigil and init should be exported
    expect(init).toBeDefined();
    expect(typeof init).toBe('function');
    
    expect(Vigil).toBeDefined();
    expect(typeof Vigil.init).toBe('function');
    expect(typeof Vigil.shutdown).toBe('function');
  });

  it('aborts cleanly if projectKey is missing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // @ts-expect-error - testing invalid input
    Vigil.init({ debug: true });
    
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid or missing projectKey'));
    expect(rrweb.record).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('gracefully degrades when session is sampled out', () => {
    const logSpy = vi.mocked(console.log);
    
    // sessionSampleRate: 0 should cause it to sample out
    Vigil.init({ projectKey: 'pk_test', sessionSampleRate: 0, debug: true });
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Session sampled out'));
    // rrweb should not be initialized
    expect(rrweb.record).not.toHaveBeenCalled();
    // It should still set itself as initialized though
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Vigil SDK initialized'),
      expect.anything()
    );
  });

  it('does not mutate the user-provided config object', () => {
    const userConfig = { projectKey: 'pk_test', sessionSampleRate: 0, disableSessionReplay: false };
    
    // sessionSampleRate: 0 should cause it to sample out and disable session replay internally
    Vigil.init(userConfig);
    
    // Original object should be untouched
    expect(userConfig.disableSessionReplay).toBe(false);
  });
});
