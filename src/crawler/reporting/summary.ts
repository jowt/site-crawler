import { CrawlSummary } from '../../types.js';
import { FailureTracker } from '../state/failures.js';
import { CrawlQueue } from '../state/queue.js';
import { CrawlStats } from '../state/stats.js';

export function buildCrawlSummary(options: {
  stats: CrawlStats;
  queue: CrawlQueue;
  failures: FailureTracker;
  startTime: number;
  cancelled: boolean;
  now?: number;
}): CrawlSummary {
  const { stats, queue, failures, startTime, cancelled, now = Date.now() } = options;

  return {
    pagesVisited: stats.pagesVisited,
    pagesSucceeded: stats.pagesSucceeded,
    pagesFailed: stats.pagesFailed,
    uniqueUrlsDiscovered: queue.uniqueCount,
    maxDepth: stats.maxDepth,
    totalLinksExtracted: stats.totalLinksExtracted,
    statusCounts: Object.fromEntries(
      [...stats.statusCounts.entries()].map(([status, count]) => [String(status), count]),
    ),
    failureReasons: Object.fromEntries(stats.failureReasons.entries()),
    durationMs: now - startTime,
    actualMaxConcurrency: stats.actualMaxConcurrency,
    peakQueueSize: stats.peakQueueSize,
    duplicatesFiltered: stats.duplicatesFiltered,
    meanLinksPerPage:
      stats.pagesVisited === 0
        ? 0
        : Number((stats.totalLinksExtracted / stats.pagesVisited).toFixed(2)),
    cancelled,
    retryAttempts: stats.retryAttempts,
    retrySuccesses: stats.retrySuccesses,
    retryFailures: stats.retryFailures,
    failureLog: failures.list(),
  };
}
