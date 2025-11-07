import pLimit from 'p-limit';

import {
  CrawlHandlers,
  CrawlOptions,
  CrawlQueueItem,
  CrawlSummary,
  FetchPageResult,
  PageResult,
} from '../types.js';
import { writePage, writeSummary } from '../util/output.js';
import { sameSubdomain } from '../util/sameSubdomain.js';
import { fetchPage } from './fetchPage.js';
import { normalizeUrl } from './normalizeUrl.js';
import { parseLinks } from './parseLinks.js';

export interface CrawlRuntimeOptions {
  normalizedStart: string;
  options: CrawlOptions;
  handlers?: CrawlHandlers;
}

interface CrawlStats {
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
}

const DEFAULT_MAX_RETRIES = 1;

export async function crawl({
  normalizedStart,
  options,
  handlers = {
    onPage: (result: PageResult) => writePage(result, options.format),
  },
}: CrawlRuntimeOptions): Promise<void> {
  const queue: CrawlQueueItem[] = [{ url: normalizedStart, depth: 0 }];
  const seen = new Set<string>([normalizedStart]);

  let processedPages = 0;
  let activeCount = 0;
  let runningCount = 0;
  let cancelled = false;
  const startTime = Date.now();

  const stats: CrawlStats = {
    pagesVisited: 0,
    pagesSucceeded: 0,
    pagesFailed: 0,
    maxDepth: 0,
    totalLinksExtracted: 0,
    statusCounts: new Map<number, number>(),
    actualMaxConcurrency: 0,
    peakQueueSize: queue.length,
    duplicatesFiltered: 0,
    failureReasons: new Map<string, number>(),
  };

  const limiter = pLimit(options.concurrency);
  const activePromises = new Set<Promise<void>>();

  const sigintHandler = (): void => {
    cancelled = true;
  };

  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.once('SIGINT', sigintHandler);
  }

  const finalize = (): void => {
    if (typeof process !== 'undefined' && typeof process.removeListener === 'function') {
      process.removeListener('SIGINT', sigintHandler);
    }
  };

  const enqueue = (item: CrawlQueueItem): void => {
    queue.push(item);
    seen.add(item.url);
    stats.peakQueueSize = Math.max(stats.peakQueueSize, queue.length);

    if (options.priority === 'shallow') {
      queue.sort((a, b) => a.depth - b.depth);
    }
  };

  const dequeue = (): CrawlQueueItem | undefined => {
    if (queue.length === 0) {
      return undefined;
    }

    if (options.priority === 'shallow') {
      queue.sort((a, b) => a.depth - b.depth);
    }

    return queue.shift();
  };

  const schedule = (item: CrawlQueueItem): void => {
    activeCount += 1;

    const task = limiter(async () => {
      runningCount += 1;
      stats.actualMaxConcurrency = Math.max(stats.actualMaxConcurrency, runningCount);
      try {
        await handleItem(item);
      } finally {
        runningCount -= 1;
      }
    })
      .catch((error: unknown) => {
        if (handlers.onError) {
          handlers.onError(error instanceof Error ? error : new Error(String(error)), {
            url: item.url,
            depth: item.depth,
          });
        }
      })
      .finally(() => {
        activeCount -= 1;
        processedPages += 1;
        activePromises.delete(task);

        if (!cancelled) {
          runQueue();
        }
      });

    activePromises.add(task);
  };

  const runQueue = (): void => {
    while (!cancelled && queue.length > 0) {
      if (options.maxPages && processedPages + activeCount >= options.maxPages) {
        break;
      }

      const next = dequeue();
      if (!next) {
        break;
      }

      schedule(next);
    }
  };

  const handleItem = async (item: CrawlQueueItem): Promise<void> => {
    const fetchResult = await fetchPage(item.url, {
      timeoutMs: options.timeoutMs,
      maxRetries: DEFAULT_MAX_RETRIES,
    });

    const pageBase = new URL(fetchResult.url);
    const normalizedVisited = normalizeOrFallback(pageBase);
    seen.add(normalizedVisited);

    const pageResult: PageResult = {
      url: normalizedVisited,
      depth: item.depth,
      status: fetchResult.status ?? undefined,
      contentType: fetchResult.contentType,
      links: [],
    };

    if (!fetchResult.ok) {
      if (fetchResult.error) {
        pageResult.error = fetchResult.error.message;
      } else if (fetchResult.status) {
        pageResult.error = `HTTP ${fetchResult.status}`;
      } else {
        pageResult.error = 'Request failed';
      }
    }

    const failureReason = determineFailureReason(fetchResult, pageResult);

    if (!fetchResult.html) {
      recordPageMetrics(pageResult, fetchResult.ok, fetchResult.status, failureReason);
      handlers.onPage(pageResult);
      return;
    }

    const rawLinks = parseLinks(fetchResult.html);
    const normalizedLinks = new Set<string>();

    for (const rawLink of rawLinks) {
      const normalized = normalizeUrl(rawLink, pageBase, {
        stripTracking: options.stripTracking,
      });

      if (!normalized) {
        continue;
      }

      if (!sameSubdomain(normalizedVisited, normalized)) {
        continue;
      }

      normalizedLinks.add(normalized);

      if (fetchResult.ok) {
        if (!seen.has(normalized)) {
          enqueue({ url: normalized, depth: item.depth + 1 });
        } else {
          stats.duplicatesFiltered += 1;
        }
      }
    }

    pageResult.links = [...normalizedLinks];
    recordPageMetrics(pageResult, fetchResult.ok, fetchResult.status, failureReason);
    handlers.onPage(pageResult);
  };

  const normalizeOrFallback = (raw: URL): string => {
    const normalized = normalizeUrl(raw.href, raw, {
      stripTracking: options.stripTracking,
    });

    return normalized ?? raw.href;
  };

  const recordPageMetrics = (
    page: PageResult,
    ok: boolean,
    status: number | null,
    failureReason: string | undefined,
  ): void => {
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
  };

  const determineFailureReason = (
    fetchResult: FetchPageResult,
    page: PageResult,
  ): string | undefined => {
    if (fetchResult.ok) {
      return undefined;
    }

    const error = fetchResult.error;
    if (error instanceof Error) {
      if (error.name === 'AbortError' && error.message) {
        return error.message;
      }

      if (error.name && error.name !== 'Error') {
        return error.name;
      }

      if (error.message) {
        return error.message;
      }
    }

    if (typeof fetchResult.status === 'number') {
      return `HTTP ${fetchResult.status}`;
    }

    return page.error ?? 'Unknown failure';
  };

  const emitSummary = (): void => {
    const summary: CrawlSummary = {
      pagesVisited: stats.pagesVisited,
      pagesSucceeded: stats.pagesSucceeded,
      pagesFailed: stats.pagesFailed,
      uniqueUrlsDiscovered: seen.size,
      maxDepth: stats.maxDepth,
      totalLinksExtracted: stats.totalLinksExtracted,
      statusCounts: Object.fromEntries(
        [...stats.statusCounts.entries()].map(([status, count]) => [String(status), count]),
      ),
      failureReasons: Object.fromEntries(stats.failureReasons.entries()),
      durationMs: Date.now() - startTime,
      actualMaxConcurrency: stats.actualMaxConcurrency,
      peakQueueSize: stats.peakQueueSize,
      duplicatesFiltered: stats.duplicatesFiltered,
      meanLinksPerPage:
        stats.pagesVisited === 0
          ? 0
          : Number((stats.totalLinksExtracted / stats.pagesVisited).toFixed(2)),
      cancelled,
    };

    if (handlers.onComplete) {
      handlers.onComplete(summary);
      return;
    }

    writeSummary(summary, options.format);
  };

  try {
    runQueue();
    while (activePromises.size > 0) {
      await Promise.allSettled([...activePromises]);
    }
    emitSummary();
  } finally {
    finalize();
  }
}
