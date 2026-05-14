import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../utils';

describe('sanitizeUrl', () => {
  it('strips query parameters', () => {
    expect(sanitizeUrl('https://example.com/path?user=123&token=abc')).toBe('https://example.com/path');
  });

  it('strips hash fragments', () => {
    expect(sanitizeUrl('https://example.com/path#section-1')).toBe('https://example.com/path');
  });

  it('strips both query parameters and hash fragments', () => {
    expect(sanitizeUrl('https://example.com/path?foo=bar#baz')).toBe('https://example.com/path');
  });

  it('preserves clean URLs', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('handles malformed URLs gracefully using fallback splitting', () => {
    expect(sanitizeUrl('not-a-valid-url?foo=bar')).toBe('not-a-valid-url');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeUrl('')).toBe('');
  });
});
