import { describe, expect, it } from 'vitest';

import { sameSubdomain } from '../src/util/sameSubdomain.js';

describe('sameSubdomain', () => {
  it('returns true for identical hostnames ignoring case', () => {
    expect(sameSubdomain('https://Example.com/page', 'https://example.com/other')).toBe(true);
  });

  it('returns false for different subdomains', () => {
    expect(sameSubdomain('https://foo.example.com', 'https://bar.example.com')).toBe(false);
  });

  it('returns false when URL parsing fails', () => {
    expect(sameSubdomain('not-a-url', 'https://example.com')).toBe(false);
  });
});
