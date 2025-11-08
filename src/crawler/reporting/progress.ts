import { updateQuietProgress } from '../../util/output.js';
import { CrawlStats } from '../state/stats.js';
import { CrawlQueue } from '../state/queue.js';

export class ProgressReporter {
  constructor(private readonly stats: CrawlStats, private readonly queue: CrawlQueue) {}

  emit(): void {
    updateQuietProgress({
      pagesVisited: this.stats.pagesVisited,
      pagesSucceeded: this.stats.pagesSucceeded,
      pagesFailed: this.stats.pagesFailed,
      uniqueUrlsDiscovered: this.queue.uniqueCount,
      totalLinksExtracted: this.stats.totalLinksExtracted,
      retryAttempts: this.stats.retryAttempts,
      retrySuccesses: this.stats.retrySuccesses,
      retryFailures: this.stats.retryFailures,
    });
  }
}
