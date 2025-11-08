import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FailureTracker, recordFailure } from '../src/crawler/state/failures.js';
import type { CrawlStats } from '../src/crawler/state/stats.js';
import * as output from '../src/util/output.js';

describe('FailureTracker', () => {
  it('records failures and marks them as resolved when retried', () => {
    const tracker = new FailureTracker();
    const item = { url: 'https://example.com', depth: 0, attempt: 0 };
    const page = { url: 'https://example.com', depth: 0, links: [] };

    tracker.record(item, page, 'HTTP 500');
    expect(tracker.list()).toMatchObject([
      { url: 'https://example.com', reason: 'HTTP 500', resolvedOnRetry: false },
    ]);

    tracker.resolve('https://example.com');
    expect(tracker.list()[0].resolvedOnRetry).toBe(true);
  });
});

describe('recordFailure', () => {
  const createStats = (): CrawlStats => ({
    pagesVisited: 0,
    pagesSucceeded: 0,
    pagesFailed: 0,
    maxDepth: 0,
    totalLinksExtracted: 0,
    statusCounts: new Map(),
    actualMaxConcurrency: 0,
    peakQueueSize: 0,
    duplicatesFiltered: 0,
    failureReasons: new Map(),
    retryAttempts: 0,
    retrySuccesses: 0,
    retryFailures: 0,
  });

  const item = { url: 'https://example.com', depth: 0, attempt: 0 };
  const page = { url: 'https://example.com', depth: 0, links: [] };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('schedules a retry when allowed and attempts remain', () => {
    const tracker = new FailureTracker();
    const stats = createStats();
    const enqueueRetry = vi.fn();
    const logSpy = vi.spyOn(output, 'logError').mockImplementation(() => {});

    recordFailure({
      item,
      page,
      reason: 'HTTP 500',
      stats,
      failures: tracker,
      enqueueRetry,
      allowRetry: true,
      maxAdditionalAttempts: 1,
    });

    expect(stats.retryAttempts).toBe(1);
    expect(enqueueRetry).toHaveBeenCalledWith({ url: page.url, depth: item.depth, attempt: 1 });
    expect(logSpy).toHaveBeenCalledWith(
      '[retry] attempt 1 failed for https://example.com: HTTP 500. Scheduling retry.',
    );
  });

  it('records a terminal failure when retries are exhausted', () => {
    const tracker = new FailureTracker();
    const stats = createStats();
    const enqueueRetry = vi.fn();
    const skipRetryItem = { ...item, attempt: 1 };
    const logSpy = vi.spyOn(output, 'logError').mockImplementation(() => {});

    recordFailure({
      item: skipRetryItem,
      page,
      reason: 'HTTP 500',
      stats,
      failures: tracker,
      enqueueRetry,
      allowRetry: true,
      maxAdditionalAttempts: 1,
    });

    expect(stats.retryAttempts).toBe(0);
    expect(stats.retryFailures).toBe(1);
    expect(enqueueRetry).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      '[retry] attempt 2 failed for https://example.com: HTTP 500. No retries left.',
    );
  });

  it('logs and skips retries when retrying is disabled', () => {
    const tracker = new FailureTracker();
    const stats = createStats();
    const enqueueRetry = vi.fn();
    const logSpy = vi.spyOn(output, 'logError').mockImplementation(() => {});

    recordFailure({
      item,
      page,
      reason: 'HTTP 500',
      stats,
      failures: tracker,
      enqueueRetry,
      allowRetry: false,
      maxAdditionalAttempts: 1,
    });

    expect(stats.retryAttempts).toBe(0);
    expect(stats.retryFailures).toBe(0);
    expect(enqueueRetry).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('[failure] https://example.com: HTTP 500');
  });
});
