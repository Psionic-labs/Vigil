import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isSessionSampled } from '../sampling/session-sampling';
import { clearSamplingDecision } from '../sampling/sampling-storage';

describe('session-sampling', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn()
    });
    clearSamplingDecision();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSamplingDecision();
  });

  it('samples in 1.0 rates deterministically', () => {
    expect(isSessionSampled(1.0)).toBe(true);
    // 1.0 is hardcoded true, so it shouldn't even interact with storage or random
    expect(sessionStorage.getItem).not.toHaveBeenCalled();
  });

  it('samples out 0.0 rates deterministically', () => {
    expect(isSessionSampled(0.0)).toBe(false);
    // 0.0 is hardcoded false
    expect(sessionStorage.getItem).not.toHaveBeenCalled();
  });

  it('uses Math.random for intermediate rates and caches the result', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2); // Will be sampled in for rate 0.5
    
    // First call
    expect(isSessionSampled(0.5)).toBe(true);
    expect(randomSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.setItem).toHaveBeenCalledWith('vigil_sampled_out', '0');

    // Simulate stored decision
    vi.mocked(sessionStorage.getItem).mockReturnValue('0');

    // Second call (should use storage, not Math.random)
    expect(isSessionSampled(0.5)).toBe(true);
    expect(randomSpy).toHaveBeenCalledTimes(1); // Still 1
  });

  it('caches sampled out decisions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8); // Will be sampled out for rate 0.5
    
    expect(isSessionSampled(0.5)).toBe(false);
    expect(sessionStorage.setItem).toHaveBeenCalledWith('vigil_sampled_out', '1');

    vi.mocked(sessionStorage.getItem).mockReturnValue('1');
    expect(isSessionSampled(0.5)).toBe(false);
    expect(randomSpy).toHaveBeenCalledTimes(1);
  });

  it('handles sessionStorage being unavailable safely', () => {
    vi.stubGlobal('sessionStorage', undefined); // Remove sessionStorage completely
    
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2); 
    
    // Should fallback to memory variable and succeed
    expect(isSessionSampled(0.5)).toBe(true);
    expect(randomSpy).toHaveBeenCalledTimes(1);

    // Second call should return cached true without random
    expect(isSessionSampled(0.5)).toBe(true);
    expect(randomSpy).toHaveBeenCalledTimes(1); 
  });
  
  it('handles sessionStorage throwing safely', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('Quota exceeded or security error'); },
      setItem: () => { throw new Error('Quota exceeded or security error'); }
    });
    
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8); // > 0.5 so false
    
    // Should fallback to memory variable and succeed
    expect(isSessionSampled(0.5)).toBe(false);
    expect(randomSpy).toHaveBeenCalledTimes(1);

    // Second call should return cached false without random
    expect(isSessionSampled(0.5)).toBe(false);
    expect(randomSpy).toHaveBeenCalledTimes(1); 
  });
});
