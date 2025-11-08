import { describe, expect, it } from 'vitest';

import { CrawlQueue } from '../src/crawler/state/queue.js';

describe('CrawlQueue', () => {
  it('starts with the initial URL enqueued and marked as seen', () => {
    const queue = new CrawlQueue('https://example.com');

    expect(queue.pending).toBe(1);
    expect(queue.dequeue()).toMatchObject({ url: 'https://example.com', depth: 0, attempt: 0 });
    expect(queue.dequeue()).toBeUndefined();
  });

  it('enqueues new URLs while filtering duplicates', () => {
    const queue = new CrawlQueue('https://example.com');

    expect(queue.enqueueIfNew('https://example.com/about', 1)).toBe(true);
    expect(queue.enqueueIfNew('https://example.com/about', 1)).toBe(false);
    expect(queue.pending).toBe(2);
    expect(queue.uniqueCount).toBe(2);

    queue.dequeue();
    const next = queue.dequeue();
    expect(next).toMatchObject({ url: 'https://example.com/about', depth: 1, attempt: 0 });
  });

  it('supports manual retry enqueues without affecting uniqueness tracking', () => {
    const queue = new CrawlQueue('https://example.com');
    queue.enqueue({ url: 'https://example.com/about', depth: 1, attempt: 1 });

    expect(queue.pending).toBe(2);
    // Unique count stays at 1 because retries should not add to seen URLs.
    expect(queue.uniqueCount).toBe(1);
  });
});
