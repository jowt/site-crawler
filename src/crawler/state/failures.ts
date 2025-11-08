import { FailureEvent, CrawlQueueItem, PageResult } from '../../types.js';
import { logError } from '../../util/output.js';
import { CrawlStats } from './stats.js';

export class FailureTracker {
  private readonly log: FailureEvent[] = [];
  private readonly index = new Map<string, number[]>();

  record(item: CrawlQueueItem, page: PageResult, reason: string): void {
    const event = createFailureEvent(item, page, reason);
    this.log.push(event);

    const entries = this.index.get(page.url) ?? [];
    entries.push(this.log.length - 1);
    this.index.set(page.url, entries);
  }

  resolve(url: string): void {
    const entries = this.index.get(url);
    if (!entries?.length) {
      return;
    }

    const lastIndex = entries.pop();
    if (lastIndex === undefined) {
      return;
    }

    this.log[lastIndex] = {
      ...this.log[lastIndex],
      resolvedOnRetry: true,
    };

    if (entries.length === 0) {
      this.index.delete(url);
    } else {
      this.index.set(url, entries);
    }
  }

  list(): FailureEvent[] {
    return this.log;
  }
}

export function recordFailure(options: {
  item: CrawlQueueItem;
  page: PageResult;
  reason: string;
  stats: CrawlStats;
  failures: FailureTracker;
  enqueueRetry: (item: CrawlQueueItem) => void;
  allowRetry: boolean;
  maxAdditionalAttempts: number;
}): void {
  const { item, page, reason, stats, failures, enqueueRetry, allowRetry, maxAdditionalAttempts } =
    options;

  failures.record(item, page, reason);

  if (!allowRetry) {
    logError(`[failure] ${page.url}: ${reason}`);
    return;
  }

  if (item.attempt < maxAdditionalAttempts) {
    stats.retryAttempts += 1;
    logError(
      `[retry] attempt ${item.attempt + 1} failed for ${page.url}: ${reason}. Scheduling retry.`,
    );
    enqueueRetry({ url: page.url, depth: item.depth, attempt: item.attempt + 1 });
    return;
  }

  stats.retryFailures += 1;
  logError(
    `[retry] attempt ${item.attempt + 1} failed for ${page.url}: ${reason}. No retries left.`,
  );
}

export function createFailureEvent(
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
