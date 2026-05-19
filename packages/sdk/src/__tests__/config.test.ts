import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as rrweb from 'rrweb';
import { Vigil } from '../index';
import { normalizeConfig } from '../config/normalize-config';
import { validateConfig } from '../config/validate-config';
import { DEFAULT_CONFIG } from '../config/defaults';

vi.mock('rrweb', () => ({
  record: vi.fn(() => vi.fn())
}));

describe('SDK configuration and feature flags', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { 
      location: { href: 'http://loc' }, 
      screen: { width: 1024, height: 768 },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      history: { pushState: vi.fn(), replaceState: vi.fn() }
    });
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    vi.stubGlobal('navigator', { userAgent: 'test' });
  });

  afterEach(() => {
    Vigil.shutdown();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('applies default config values', () => {
    const config = normalizeConfig({ projectKey: 'pk_test' });
    expect(config.maskAllInputs).toBe(true);
    expect(config.endpoint).toBe('https://ingest.usevigilhq.com/api/ingest');
    expect(config.flushInterval).toBe(5000);
    expect(config.sessionSampleRate).toBe(1.0);
    expect(config.debug).toBe(false);
  });

  it('rejects invalid endpoints and sample rates safely', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const config = normalizeConfig({ 
      projectKey: 'pk_test',
      endpoint: 'not-a-url',
      sessionSampleRate: 5.0, // Invalid, > 1
      flushInterval: -10, // Invalid
      debug: true
    });
    
    const isValid = validateConfig(config);
    expect(isValid).toBe(true); // Still valid, but values are overwritten
    
    expect(config.endpoint).toBe(DEFAULT_CONFIG.endpoint);
    expect(config.sessionSampleRate).toBe(DEFAULT_CONFIG.sessionSampleRate);
    expect(config.flushInterval).toBe(DEFAULT_CONFIG.flushInterval);
    
    expect(warnSpy).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });

  it('does not initialize disabled detectors', () => {
    const addListenerSpy = vi.mocked(window.addEventListener);
    
    Vigil.init({ 
      projectKey: 'pk_test',
      disableErrorTracking: true,
      disableNavigationTracking: true,
      disableClickTracking: true,
      debug: true
    });
    
    const calls = addListenerSpy.mock.calls.map(c => c[0]);
    // Since error, navigation, and click tracking are disabled,
    // window should only have flush/pagehide/beforeunload listeners attached.
    expect(calls).not.toContain('error');
    expect(calls).not.toContain('unhandledrejection');
    expect(calls).not.toContain('popstate');
  });

  it('disables replay when configured', () => {
    Vigil.init({ 
      projectKey: 'pk_test',
      disableSessionReplay: true,
      debug: true
    });
    
    expect(rrweb.record).not.toHaveBeenCalled();
  });
});
