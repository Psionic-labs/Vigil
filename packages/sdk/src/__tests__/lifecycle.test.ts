import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as rrweb from 'rrweb';
import { Vigil } from '../index';

vi.mock('rrweb', () => ({
  record: vi.fn(() => vi.fn())
}));

describe('SDK lifecycle integration', () => {
  beforeEach(() => {
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
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    Vigil.shutdown();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('allows reinitialization after shutdown', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    expect(rrweb.record).toHaveBeenCalledTimes(1);
    
    // Shut down cleanly
    Vigil.shutdown();
    
    // Try to init again
    Vigil.init({ projectKey: 'pk_test_2', debug: true });
    
    // Should initialize successfully the second time
    expect(rrweb.record).toHaveBeenCalledTimes(2);
    const vigil = window.__vigil;
    expect(vigil).toBeDefined();
    // Verify fresh state after reinitialization
    expect(vigil?.metadata).toBeDefined();

    // If projectKey is stored elsewhere, verify it there
    // expect(vigil.config.projectKey).toBe('pk_test_2');
    expect(vigil?.events).toHaveLength(0);
    expect(vigil?.summaryEvents).toHaveLength(0);
  });

  it('preserves no stale internal state between sessions', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    
    const vigil1 = window.__vigil;
    vigil1?.summaryEvents.push({ type: 'js_error', timestampMs: 1 });
    expect(vigil1?.summaryEvents).toHaveLength(1);
    
    Vigil.shutdown();
    
    Vigil.init({ projectKey: 'pk_test', debug: true });
    const vigil2 = window.__vigil;
    
    // State should be fresh
    expect(vigil2?.summaryEvents).toHaveLength(0);
  });

  it('maintains stable listener counts across init/shutdown cycles', () => {
    const addListenerSpy = vi.mocked(window.addEventListener);
    const removeListenerSpy = vi.mocked(window.removeEventListener);
    
    Vigil.init({ projectKey: 'pk_test' });
    const addedCount = addListenerSpy.mock.calls.length;
    
    Vigil.shutdown();
    const removedCount = removeListenerSpy.mock.calls.length;
    
    // All added listeners should be removed
    expect(addedCount).toBeGreaterThan(0);
    expect(removedCount).toBeGreaterThanOrEqual(addedCount);
  });
});
