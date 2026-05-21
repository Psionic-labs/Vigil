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

describe('SDK shutdown behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.stubGlobal('navigator', { 
      userAgent: 'test',
      sendBeacon: vi.fn().mockReturnValue(true)
    });
    vi.stubGlobal('Blob', MockBlob);
    
    // Stub global APIs to track restoration
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    (window as any).__originalPushState = originalPushState;
    (window as any).__originalReplaceState = originalReplaceState;
    
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

  it('removes listeners and restores patched APIs on shutdown', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    
    // Verify some patches were applied (e.g. pushState)
    expect(window.history.pushState).not.toBe((window as any).__originalPushState);

    // Get the stop recording mock
    const rrwebStopMock = vi.mocked(rrweb.record).mock.results[0]?.value;
    
    Vigil.shutdown();

    // Verify rrweb stop function was called
    expect(rrwebStopMock).toHaveBeenCalled();

    // Verify history APIs are restored
    expect(window.history.pushState).toBe((window as any).__originalPushState);
    expect(window.history.replaceState).toBe((window as any).__originalReplaceState);

    // Verify global unhandledrejection / error listeners are removed
    const windowRemoveListener = vi.mocked(window.removeEventListener);
    expect(windowRemoveListener).toHaveBeenCalledWith('error', expect.any(Function), true);
    expect(windowRemoveListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function), true);
    
    // Verify document listeners are removed (click, etc)
    const docRemoveListener = vi.mocked(document.removeEventListener);
    expect(docRemoveListener).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });

    // Debug object should be removed
    expect(window.__vigil).toBeUndefined();
  });

  it('clears all flush timers on shutdown', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    Vigil.shutdown();
    
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    clearIntervalSpy.mockRestore();
  });

  it('triggers terminal payload delivery on shutdown', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    
    // Simulate an event so the payload is not empty
    window.__vigil!.summaryEvents.push({ type: 'js_error', timestampMs: 123 } as any);
    
    vi.mocked((globalThis as any).navigator.sendBeacon).mockClear();
    
    Vigil.shutdown();
    
    expect((globalThis as any).navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const mockBlob = (globalThis as any).navigator.sendBeacon.mock.calls[0]![1] as MockBlob;
    const sentPayload = JSON.parse(mockBlob.parts[0]!);
    expect(sentPayload.isFinal).toBe(true);
  });

  it('clears session ID from storage on shutdown to prevent reuse', () => {
    Vigil.init({ projectKey: 'pk_test', debug: true });
    
    const removeItemSpy = vi.mocked(sessionStorage.removeItem);
    removeItemSpy.mockClear();
    
    Vigil.shutdown();
    
    expect(removeItemSpy).toHaveBeenCalledWith('vigil_session_id');
  });
});
