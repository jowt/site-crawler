import pLimit from 'p-limit';

import {
  CrawlHandlers,
  CrawlOptions,
  CrawlQueueItem,
  CrawlSummary,
  FailureEvent,
  FetchPageResult,
  PageResult,
} from '../types.js';
import {
  flushOutputBuffers,
  logError,
  resetOutputConfig,
  setOutputConfig,
  updateQuietProgress,
  writePage,
  writeSummary,
} from '../util/output.js';
import { reportCrawlerError } from '../util/errorHandler.js';
import { ensureCrawlerError } from '../errors.js';
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
  retryAttempts: number;
  retrySuccesses: number;
  retryFailures: number;
  failureLog: FailureEvent[];
}

const DEFAULT_MAX_RETRIES = 1;
const MAX_ADDITIONAL_ATTEMPTS = 1;

export async function crawl({
  normalizedStart,
  options,
  handlers = {
    onPage: (result: PageResult) => writePage(result, options.format),
  },
}: CrawlRuntimeOptions): Promise<void> {
  setOutputConfig({ quiet: options.quiet, outputFile: options.outputFile, format: options.format });
  const queue: CrawlQueueItem[] = [{ url: normalizedStart, depth: 0, attempt: 0 }];
  const seen = new Set<string>([normalizedStart]);
  // A future hash-based dedupe map keyed by content signature would companion the URL set above.
  // When --dedupe-by-hash becomes active, we will compute page body hashes and skip repeats here.

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
    retryAttempts: 0,
    retrySuccesses: 0,
    retryFailures: 0,
    failureLog: [],
  };

  const limiter = pLimit(options.concurrency);
  // Additional per-host limiters would live alongside this when honoring robots.txt crawl delays.
  const activePromises = new Set<Promise<void>>();
  const failureLogIndex = new Map<string, number[]>();

  const emitQuietProgress = (): void => {
    updateQuietProgress({
      pagesVisited: stats.pagesVisited,
      pagesSucceeded: stats.pagesSucceeded,
      pagesFailed: stats.pagesFailed,
      uniqueUrlsDiscovered: seen.size,
      totalLinksExtracted: stats.totalLinksExtracted,
      retryAttempts: stats.retryAttempts,
      retrySuccesses: stats.retrySuccesses,
      retryFailures: stats.retryFailures,
    });
  };

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

    // Alternate queue priorities (e.g. shallow-first) would reorder the queue here.
  };

  const dequeue = (): CrawlQueueItem | undefined => {
    if (queue.length === 0) {
      return undefined;
    }

    // Future priority modes could select the next item differently at this point.

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
        const crawlerError = ensureCrawlerError(error, {
          kind: 'internal',
          severity: 'fatal',
          details: { url: item.url, depth: item.depth },
        });

        reportCrawlerError(
          crawlerError,
          { stage: 'crawl', url: item.url, depth: item.depth },
          { throwOnFatal: false },
        );

        if (handlers.onError) {
          handlers.onError(crawlerError, {
            url: item.url,
            depth: item.depth,
          });
        }

        if (crawlerError.severity === 'fatal') {
          throw crawlerError;
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

  const logFailureEvent = (item: CrawlQueueItem, page: PageResult, reason: string): void => {
    const event = createFailureEvent(item, page, reason);
    stats.failureLog.push(event);
    const entries = failureLogIndex.get(page.url) ?? [];
    entries.push(stats.failureLog.length - 1);
    failureLogIndex.set(page.url, entries);
  };

  const markFailureResolved = (url: string): void => {
    const entries = failureLogIndex.get(url);
    if (!entries || entries.length === 0) {
      return;
    }

    const lastIndex = entries.pop();
    if (lastIndex === undefined) {
      return;
    }

    stats.failureLog[lastIndex] = {
      ...stats.failureLog[lastIndex],
      resolvedOnRetry: true,
    };

    if (entries.length === 0) {
      failureLogIndex.delete(url);
    } else {
      failureLogIndex.set(url, entries);
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
    // When dedupe-by-hash lands, we would compare the fetched body hash here and skip duplicates if requested.
    // Hash computation for identical content elimination would occur here prior to parsing links.

    if (!fetchResult.ok) {
      if (fetchResult.error) {
        reportCrawlerError(fetchResult.error, {
          stage: 'fetch',
          url: pageResult.url,
          depth: item.depth,
          attempt: item.attempt,
        }, { throwOnFatal: false });
        pageResult.error = fetchResult.error.message;
      } else if (fetchResult.status) {
        pageResult.error = `HTTP ${fetchResult.status}`;
      } else {
        pageResult.error = 'Request failed';
      }
    }

    const failureReason = determineFailureReason(fetchResult, pageResult);

    if (fetchResult.ok && item.attempt > 0) {
      stats.retrySuccesses += 1;
      markFailureResolved(pageResult.url);
    }

    if (!fetchResult.ok) {
      const reason = failureReason ?? 'Unknown failure';
      logFailureEvent(item, pageResult, reason);

      if (item.attempt < MAX_ADDITIONAL_ATTEMPTS) {
        stats.retryAttempts += 1;
        logError(
          `[retry] attempt ${item.attempt + 1} failed for ${pageResult.url}: ${reason}. Scheduling retry.`,
        );
        enqueue({ url: pageResult.url, depth: item.depth, attempt: item.attempt + 1 });
      } else {
        stats.retryFailures += 1;
        logError(
          `[retry] attempt ${item.attempt + 1} failed for ${pageResult.url}: ${reason}. No retries left.`,
        );
      }
    }

    if (!fetchResult.html) {
      recordPageMetrics(pageResult, fetchResult.ok, fetchResult.status, failureReason);
      emitQuietProgress();
      handlers.onPage(pageResult);
      return;
    }

    let rawLinks: string[];
    try {
      rawLinks = parseLinks(fetchResult.html);
    } catch (error) {
      const crawlerError = reportCrawlerError(error, {
        stage: 'parse',
        url: pageResult.url,
        depth: item.depth,
      }, { throwOnFatal: false });
      pageResult.error = crawlerError.message;
      fetchResult.html = undefined;
      logFailureEvent(item, pageResult, crawlerError.message);
      recordPageMetrics(pageResult, false, fetchResult.status, crawlerError.message);
      emitQuietProgress();
      handlers.onPage(pageResult);
      return;
    }
    fetchResult.html = undefined;
    const normalizedLinks = new Set<string>();

    for (const rawLink of rawLinks) {
      const normalized = normalizeUrl(rawLink, pageBase);

      if (!normalized) {
        continue;
      }

      if (!sameSubdomain(normalizedVisited, normalized)) {
        continue;
      }

      normalizedLinks.add(normalized);

      if (fetchResult.ok) {
        if (!seen.has(normalized)) {
          enqueue({ url: normalized, depth: item.depth + 1, attempt: 0 });
        } else {
          stats.duplicatesFiltered += 1;
        }
      }
    }

    pageResult.links = [...normalizedLinks];
    recordPageMetrics(pageResult, fetchResult.ok, fetchResult.status, failureReason);
    emitQuietProgress();
    handlers.onPage(pageResult);
  };

  const normalizeOrFallback = (raw: URL): string => {
    const normalized = normalizeUrl(raw.href, raw);
    // Tracking-parameter cleanup would reappear here once the option is supported again.

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
      retryAttempts: stats.retryAttempts,
      retrySuccesses: stats.retrySuccesses,
      retryFailures: stats.retryFailures,
      failureLog: stats.failureLog,
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
    flushOutputBuffers();
    resetOutputConfig();
    finalize();
  }
}

function createFailureEvent(
  item: CrawlQueueItem,
  page: PageResult,
  reason: string,
): FailureEvent {
  return {
    url: page.url,
    depth: item.depth,
    reason,
    attempt: item.attempt + 1,
    resolvedOnRetry: false,
  };
}
