import { describe, expect, it } from 'vitest';

import { resolveCrawlDelayMs } from '../src/crawler/network/robots.js';

describe('resolveCrawlDelayMs', () => {
  it('returns a mocked crawl delay of 0ms', async () => {
    const delay = await resolveCrawlDelayMs(new URL('https://example.com/'), 1_000);
    expect(delay).toBe(0);
  });
});
