import { PageResult } from '../../types.js';

export interface CrawlStats {
  pagesVisited: number;
  pagesSucceeded: number;
  pagesFailed: number;
  maxDepth: number;
  totalLinksExtracted: number;
  statusCounts: Map<number, number>;
  actualMaxConcurrency: number;
  peakQueueSize: number;
  duplicatesFiltered: number;
  failureReasons: Map<string, number>;
  retryAttempts: number;
  retrySuccesses: number;
  retryFailures: number;
}

export function initializeStats(initialQueueSize: number): CrawlStats {
  return {
    pagesVisited: 0,
    pagesSucceeded: 0,
    pagesFailed: 0,
    maxDepth: 0,
    totalLinksExtracted: 0,
    statusCounts: new Map<number, number>(),
    actualMaxConcurrency: 0,
    peakQueueSize: initialQueueSize,
    duplicatesFiltered: 0,
    failureReasons: new Map<string, number>(),
    retryAttempts: 0,
    retrySuccesses: 0,
    retryFailures: 0,
  };
}

export function recordPageMetrics(
  stats: CrawlStats,
  page: PageResult,
  ok: boolean,
  status: number | null,
  failureReason: string | undefined,
): void {
  stats.pagesVisited += 1;
  stats.maxDepth = Math.max(stats.maxDepth, page.depth);
  stats.totalLinksExtracted += page.links.length;

  if (ok) {
    stats.pagesSucceeded += 1;
  } else {
    stats.pagesFailed += 1;
    if (failureReason) {
      const current = stats.failureReasons.get(failureReason) ?? 0;
      stats.failureReasons.set(failureReason, current + 1);
    }
  }

  if (typeof status === 'number') {
    const current = stats.statusCounts.get(status) ?? 0;
    stats.statusCounts.set(status, current + 1);
  }
}
