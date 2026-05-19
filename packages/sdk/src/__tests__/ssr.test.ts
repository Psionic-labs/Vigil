import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as rrweb from 'rrweb';
import { Vigil } from '../index';

vi.mock('rrweb', () => ({
  record: vi.fn(() => vi.fn())
}));

describe('SSR safety and environments', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not initialize in non-browser environments (missing window)', () => {
    // We don't stub window or document here
    expect(typeof window).toBe('undefined');
    
    // Should safely abort without throwing
    expect(() => {
      Vigil.init({ projectKey: 'pk_test', debug: true });
    }).not.toThrow();
    
    expect(rrweb.record).not.toHaveBeenCalled();
  });

  it('does not initialize if document is missing', () => {
    // Stub window but not document
    vi.stubGlobal('window', { 
      location: { href: 'http://loc' }, 
      screen: { width: 1024, height: 768 }
    });
    expect(typeof window).not.toBe('undefined');
    expect(typeof document).toBe('undefined');

    expect(() => {
      Vigil.init({ projectKey: 'pk_test', debug: true });
    }).not.toThrow();
    
    expect(rrweb.record).not.toHaveBeenCalled();
  });

  it('safely handles missing crypto APIs during session generation', () => {
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
    
    // session storage exists but no crypto
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    });
    vi.stubGlobal('crypto', undefined);

    Vigil.init({ projectKey: 'pk_test', debug: true });
    
    const vigil = (window as any).__vigil;
    expect(vigil).toBeDefined();
    // A session ID should have been generated gracefully falling back to Math.random
    expect(vigil.sessionId).toBeDefined();
    expect(typeof vigil.sessionId).toBe('string');
    
    Vigil.shutdown();
  });

  it('safely handles sessionStorage throwing errors (private browsing)', () => {
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
    
    // sessionStorage throws on access
    const mockStorage = {
      getItem: vi.fn(() => { throw new Error('Access denied'); }),
      setItem: vi.fn(() => { throw new Error('Access denied'); })
    };
    vi.stubGlobal('sessionStorage', mockStorage);

    expect(() => {
      Vigil.init({ projectKey: 'pk_test', debug: true });
    }).not.toThrow();

    const vigil = (window as any).__vigil;
    expect(vigil).toBeDefined();
    expect(vigil.sessionId).toBeDefined();

    Vigil.shutdown();
  });
});
