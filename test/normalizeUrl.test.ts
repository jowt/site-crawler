import { describe, expect, it } from 'vitest';

import { normalizeUrl, stripTracking } from '../src/crawler/normalizeUrl.js';

describe('normalizeUrl', () => {
  const base = new URL('https://Example.COM/foo/bar');

  it('lowercases scheme and host', () => {
    const normalized = normalizeUrl('HTTP://Example.com/About', base, { stripTracking: false });
    expect(normalized).toBe('http://example.com/About');
  });

  it('resolves relative paths against the base URL', () => {
    const normalized = normalizeUrl('../contact', base, { stripTracking: false });
    expect(normalized).toBe('https://example.com/contact');
  });

  it('removes fragment identifiers', () => {
    const normalized = normalizeUrl('https://example.com/path#section', base, { stripTracking: false });
    expect(normalized).toBe('https://example.com/path');
  });

  it('removes default ports', () => {
    const http = normalizeUrl('http://example.com:80/path', base, { stripTracking: false });
    const https = normalizeUrl('https://example.com:443/path', base, { stripTracking: false });

    expect(http).toBe('http://example.com/path');
    expect(https).toBe('https://example.com/path');
  });

  it('removes trailing slashes except for root', () => {
    const nested = normalizeUrl('https://example.com/path/', base, { stripTracking: false });
    const root = normalizeUrl('https://example.com/', base, { stripTracking: false });

    expect(nested).toBe('https://example.com/path');
    expect(root).toBe('https://example.com/');
  });

  it('preserves query parameters by default', () => {
    const normalized = normalizeUrl('https://example.com/path?a=1&b=2', base, { stripTracking: false });
    expect(normalized).toBe('https://example.com/path?a=1&b=2');
  });

  it('strips known tracking parameters when requested', () => {
    const normalized = normalizeUrl(
      'https://example.com/path?utm_source=test&gclid=123&keep=true',
      base,
      { stripTracking: true },
    );
    expect(normalized).toBe('https://example.com/path?keep=true');
  });

  it('returns null for unsupported schemes', () => {
    const normalized = normalizeUrl('javascript:alert(1)', base, { stripTracking: false });
    expect(normalized).toBeNull();
  });
});

describe('stripTracking', () => {
  it('removes utm_* parameters', () => {
    const params = new URLSearchParams('utm_source=newsletter&keep=true');
    stripTracking(params);
    expect(params.toString()).toBe('keep=true');
  });

  it('removes known single-field trackers', () => {
    const params = new URLSearchParams('gclid=abc&fbclid=def');
    stripTracking(params);
    expect(params.toString()).toBe('');
  });
});
