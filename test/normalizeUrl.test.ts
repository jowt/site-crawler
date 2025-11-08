import { describe, expect, it } from 'vitest';

import { normalizeUrl } from '../src/crawler/url/normalizeUrl.js';

describe('normalizeUrl', () => {
  const base = new URL('https://Example.COM/foo/bar');

  it('lowercases scheme and host', () => {
    const normalized = normalizeUrl('HTTP://Example.com/About', base);
    expect(normalized).toBe('http://example.com/About');
  });

  it('resolves relative paths against the base URL', () => {
    const normalized = normalizeUrl('../contact', base);
    expect(normalized).toBe('https://example.com/contact');
  });

  it('removes fragment identifiers', () => {
    const normalized = normalizeUrl('https://example.com/path#section', base);
    expect(normalized).toBe('https://example.com/path');
  });

  it('removes default ports', () => {
    const http = normalizeUrl('http://example.com:80/path', base);
    const https = normalizeUrl('https://example.com:443/path', base);

    expect(http).toBe('http://example.com/path');
    expect(https).toBe('https://example.com/path');
  });

  it('removes trailing slashes except for root', () => {
    const nested = normalizeUrl('https://example.com/path/', base);
    const root = normalizeUrl('https://example.com/', base);

    expect(nested).toBe('https://example.com/path');
    expect(root).toBe('https://example.com/');
  });

  it('preserves query parameters by default', () => {
    const normalized = normalizeUrl('https://example.com/path?a=1&b=2', base);
    expect(normalized).toBe('https://example.com/path?a=1&b=2');
  });

  it('leaves tracking parameters untouched for now', () => {
    const normalized = normalizeUrl('https://example.com/path?utm_source=test', base);
    expect(normalized).toBe('https://example.com/path?utm_source=test');
  });

  it('returns null for unsupported schemes', () => {
    const normalized = normalizeUrl('javascript:alert(1)', base);
    expect(normalized).toBeNull();
  });
});
