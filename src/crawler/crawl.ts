import pLimit from 'p-limit';

import { CrawlHandlers, CrawlOptions, CrawlQueueItem, CrawlSummary, PageResult } from '../types.js';
import { flushOutputBuffers, resetOutputConfig, setOutputConfig, writeSummary } from '../util/output.js';
import { reportCrawlerError } from '../util/errorHandler.js';
import { ensureCrawlerError } from '../errors.js';
import {
  CrawlQueue,
  FailureTracker,
  recordFailure,
  fetchPageWithRetry,
  parseAndEnqueue,
  normalizeOrFallback,
  CrawlStats,
  initializeStats,
  recordPageMetrics,
} from './index.js';
import { ProgressReporter } from './reporting/progress.js';
import { buildCrawlSummary } from './reporting/summary.js';
import { createDefaultHandlers } from './handlers/defaultHandlers.js';

export interface CrawlRuntimeOptions {
  normalizedStart: string;
  options: CrawlOptions;
  handlers?: CrawlHandlers;
}

const MAX_ADDITIONAL_ATTEMPTS = 1; // Allow a single queue-level retry without obscuring the core flow.

/**
 * Coordinates the crawl lifecycle: queue pumping, fetch/parse execution, and stats tracking.
 * Keeps the exported crawl() thin so reviewers can reason about the orchestration in one place.
 */
class CrawlerEngine {
  private readonly queue: CrawlQueue;
  private readonly failures = new FailureTracker();
  private readonly stats: CrawlStats;
  private readonly limiter: ReturnType<typeof pLimit>;
  private readonly activePromises = new Set<Promise<void>>();
  private readonly progress: ProgressReporter;
  private readonly startTime = Date.now();
  private readonly sigintHandler = (): void => {
    this.cancelled = true;
  };
  private sigintAttached = false;
  private processedPages = 0;
  private activeCount = 0;
  private runningCount = 0;
  private cancelled = false;

  constructor(
    normalizedStart: string,
    private readonly options: CrawlOptions,
    private readonly handlers: CrawlHandlers,
  ) {
    this.queue = new CrawlQueue(normalizedStart);
    this.stats = initializeStats(this.queue.pending);
    this.limiter = pLimit(this.options.concurrency);
    this.progress = new ProgressReporter(this.stats, this.queue);
  }

  async run(): Promise<CrawlSummary> {
    this.attachSignalHandler();
    try {
      this.runQueue();
      while (this.activePromises.size > 0) {
        await Promise.allSettled([...this.activePromises]);
      }

      return buildCrawlSummary({
        stats: this.stats,
        queue: this.queue,
        failures: this.failures,
        startTime: this.startTime,
        cancelled: this.cancelled,
      });
    } finally {
      this.detachSignalHandler();
    }
  }

  private attachSignalHandler(): void {
    if (typeof process === 'undefined') {
      return;
    }

    if (typeof process.once === 'function') {
      process.once('SIGINT', this.sigintHandler);
      this.sigintAttached = true;
    }
  }

  private detachSignalHandler(): void {
    if (!this.sigintAttached || typeof process === 'undefined') {
      return;
    }

    if (typeof process.removeListener === 'function') {
      process.removeListener('SIGINT', this.sigintHandler);
    }

    this.sigintAttached = false;
  }

  private readonly enqueueRetry = (item: CrawlQueueItem): void => {
    this.queue.enqueue(item);
    this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, this.queue.pending);
  };

  private runQueue(): void {
    while (!this.cancelled && this.queue.pending > 0) {
      if (this.options.maxPages && this.processedPages + this.activeCount >= this.options.maxPages) {
        break;
      }

      const next = this.queue.dequeue();
      if (!next) {
        break;
      }

      this.schedule(next);
    }
  }

  private schedule(item: CrawlQueueItem): void {
    this.activeCount += 1;

    const task = this.limiter(async () => {
      this.runningCount += 1;
      this.stats.actualMaxConcurrency = Math.max(
        this.stats.actualMaxConcurrency,
        this.runningCount,
      );
      try {
        await this.handleItem(item);
      } finally {
        this.runningCount -= 1;
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

        this.handlers.onError?.(crawlerError, {
          url: item.url,
          depth: item.depth,
        });

        if (crawlerError.severity === 'fatal') {
          throw crawlerError;
        }
      })
      .finally(() => {
        this.activeCount -= 1;
        this.processedPages += 1;
        this.activePromises.delete(task);

        if (!this.cancelled) {
          this.runQueue();
        }
      });

    this.activePromises.add(task);
  }

  private async handleItem(item: CrawlQueueItem): Promise<void> {
    const outcome = await fetchPageWithRetry(item.url, this.options.timeoutMs);
    const pageBase = new URL(outcome.url);
    const normalizedVisited = normalizeOrFallback(pageBase);
    this.queue.markVisited(normalizedVisited);

    const pageResult: PageResult = {
      url: normalizedVisited,
      depth: item.depth,
      status: outcome.status ?? undefined,
      contentType: outcome.contentType,
      links: [],
    };

    if (!outcome.ok) {
      this.handleFailedOutcome(item, pageResult, outcome.failureReason, outcome.error, outcome.status);
      return;
    }

    if (item.attempt > 0) {
      this.stats.retrySuccesses += 1;
      this.failures.resolve(pageResult.url);
    }

    if (!outcome.html) {
      recordPageMetrics(this.stats, pageResult, true, outcome.status, undefined);
      this.dispatchPage(pageResult);
      return;
    }

    const parseResult = parseAndEnqueue({
      html: outcome.html,
      baseUrl: pageBase,
      normalizedVisited,
      depth: item.depth,
      queue: this.queue,
      stats: this.stats,
    });

    if (parseResult.error) {
      this.handleParseFailure(item, pageResult, parseResult.error.message, outcome.status);
      return;
    }

    pageResult.links = parseResult.links;
    recordPageMetrics(this.stats, pageResult, true, outcome.status, undefined);
    this.dispatchPage(pageResult);
  }

  private handleFailedOutcome(
    item: CrawlQueueItem,
    pageResult: PageResult,
    failureReason: string | undefined,
    error: Error | undefined,
    status: number | null,
  ): void {
    const reason = failureReason ?? 'Request failed';
    pageResult.error = reason;

    if (error) {
      reportCrawlerError(
        error,
        { stage: 'fetch', url: pageResult.url, depth: item.depth, attempt: item.attempt },
        { throwOnFatal: false },
      );
    }

    recordFailure({
      item,
      page: pageResult,
      reason,
      stats: this.stats,
      failures: this.failures,
      enqueueRetry: this.enqueueRetry,
      allowRetry: true,
      maxAdditionalAttempts: MAX_ADDITIONAL_ATTEMPTS,
    });

    recordPageMetrics(this.stats, pageResult, false, status, reason);
    this.dispatchPage(pageResult);
  }

  private handleParseFailure(
    item: CrawlQueueItem,
    pageResult: PageResult,
    reason: string,
    status: number | null,
  ): void {
    pageResult.error = reason;

    recordFailure({
      item,
      page: pageResult,
      reason,
      stats: this.stats,
      failures: this.failures,
      enqueueRetry: this.enqueueRetry,
      allowRetry: false,
      maxAdditionalAttempts: MAX_ADDITIONAL_ATTEMPTS,
    });

    recordPageMetrics(this.stats, pageResult, false, status, reason);
    this.dispatchPage(pageResult);
  }

  private dispatchPage(pageResult: PageResult): void {
    this.progress.emit();
    this.handlers.onPage(pageResult);
  }
}

export async function crawl({ normalizedStart, options, handlers }: CrawlRuntimeOptions): Promise<void> {
  const effectiveHandlers: CrawlHandlers = {
    ...createDefaultHandlers(options.format),
    ...(handlers ?? {}),
  };

  setOutputConfig({ quiet: options.quiet, outputFile: options.outputFile, format: options.format });
  const engine = new CrawlerEngine(normalizedStart, options, effectiveHandlers);

  try {
    const summary = await engine.run();

    if (effectiveHandlers.onComplete) {
      effectiveHandlers.onComplete(summary);
    } else {
      writeSummary(summary, options.format);
    }
  } finally {
    flushOutputBuffers();
    resetOutputConfig();
  }
}
