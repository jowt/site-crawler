import { getLogger } from '../logger.js';
import { CrawlSummary, OutputFormat, PageResult } from '../types.js';

const QUIET_PROGRESS_INTERVAL_MS = 250;

interface QuietProgressSnapshot {
  pagesVisited: number;
  pagesSucceeded: number;
  pagesFailed: number;
  uniqueUrlsDiscovered: number;
  totalLinksExtracted: number;
  retryAttempts: number;
  retrySuccesses: number;
  retryFailures: number;
}

interface OutputTransport {
  emitPage(page: PageResult): void;
  emitSummary(summary: CrawlSummary): void;
  emitError(message: string): void;
  emitProgress?(snapshot: QuietProgressSnapshot): void;
  flushProgress?(options?: { persist?: boolean }): void;
  reset?(): void;
}

class LoggerTransport {
  emitPage(page: PageResult, quiet: boolean): void {
    const logger = getLogger();
    const payload = {
      event: 'page' as const,
      url: page.url,
      depth: page.depth,
      status: page.status ?? null,
      contentType: page.contentType ?? null,
      linkCount: page.links.length,
      links: page.links,
      error: page.error ?? null,
    };

    if (quiet) {
      logger.debug(payload, 'page processed');
    } else {
      logger.info(payload, 'page processed');
    }
  }

  emitSummary(summary: CrawlSummary): void {
    getLogger().info({ event: 'summary', summary }, 'crawl summary emitted');
  }

  emitError(message: string): void {
    getLogger().error({ event: 'error' }, message);
  }

  emitProgress(snapshot: QuietProgressSnapshot): void {
    getLogger().info(
      {
        event: 'progress',
        mode: 'quiet',
        pagesVisited: snapshot.pagesVisited,
        pagesSucceeded: snapshot.pagesSucceeded,
        pagesFailed: snapshot.pagesFailed,
        uniqueUrlsDiscovered: snapshot.uniqueUrlsDiscovered,
        totalLinksExtracted: snapshot.totalLinksExtracted,
        retryAttempts: snapshot.retryAttempts,
        retrySuccesses: snapshot.retrySuccesses,
        retryFailures: snapshot.retryFailures,
      },
      'quiet progress update',
    );
  }
}

class TextConsoleTransport implements OutputTransport {
  private quietProgressRendered = false;
  private quietProgressLastLength = 0;

  emitPage(page: PageResult): void {
    process.stdout.write(renderText(page));
  }

  emitSummary(summary: CrawlSummary): void {
    process.stdout.write(renderTextSummary(summary));
  }

  emitError(message: string): void {
    const payload = message.endsWith('\n') ? message : `${message}\n`;
    process.stderr.write(payload);
  }

  emitProgress(snapshot: QuietProgressSnapshot): void {
    const line = renderQuietProgressLine(snapshot);
    const padded = this.padQuietProgressLine(line);
    process.stdout.write(`\r${padded}`);
    this.quietProgressLastLength = padded.length;
    this.quietProgressRendered = true;
  }

  flushProgress(options: { persist?: boolean } = {}): void {
    if (!this.quietProgressRendered) {
      return;
    }

    if (options.persist) {
      process.stdout.write('\n');
    } else if (this.quietProgressLastLength > 0) {
      process.stdout.write(`\r${' '.repeat(this.quietProgressLastLength)}\r`);
    }

    this.quietProgressRendered = false;
    this.quietProgressLastLength = 0;
  }

  reset(): void {
    this.quietProgressRendered = false;
    this.quietProgressLastLength = 0;
  }

  private padQuietProgressLine(text: string): string {
    if (this.quietProgressLastLength > text.length) {
      return `${text}${' '.repeat(this.quietProgressLastLength - text.length)}`;
    }

    return text;
  }
}

class JsonConsoleTransport implements OutputTransport {
  emitPage(page: PageResult): void {
    process.stdout.write(renderJson(page));
  }

  emitSummary(summary: CrawlSummary): void {
    process.stdout.write(renderJsonSummary(summary));
  }

  emitError(message: string): void {
    process.stdout.write(`${JSON.stringify({ event: 'error', message })}\n`);
  }

  emitProgress(snapshot: QuietProgressSnapshot): void {
    process.stdout.write(
      `${JSON.stringify({
        event: 'progress',
        mode: 'quiet',
        pagesVisited: snapshot.pagesVisited,
        pagesSucceeded: snapshot.pagesSucceeded,
        pagesFailed: snapshot.pagesFailed,
        uniqueUrlsDiscovered: snapshot.uniqueUrlsDiscovered,
        totalLinksExtracted: snapshot.totalLinksExtracted,
        retryAttempts: snapshot.retryAttempts,
        retrySuccesses: snapshot.retrySuccesses,
        retryFailures: snapshot.retryFailures,
      })}\n`,
    );
  }

  flushProgress(): void {
    // JSON output renders progress as discrete events, nothing to flush.
  }

  reset(): void {
    // No state to reset for JSON transport.
  }
}

class OutputManager {
  private quiet = false;
  private format: OutputFormat = 'text';
  private readonly loggerTransport = new LoggerTransport();
  private transport: OutputTransport = new TextConsoleTransport();
  private quietProgressTimer: NodeJS.Timeout | undefined;
  private quietProgressPending: QuietProgressSnapshot | undefined;
  private quietProgressLastTimestamp = -Infinity;

  writePage(page: PageResult): void {
    this.loggerTransport.emitPage(page, this.quiet);

    if (this.quiet) {
      return;
    }

    this.transport.emitPage(page);
  }

  writeSummary(summary: CrawlSummary): void {
    this.flushQuietProgress({ persist: this.format === 'text' });
    this.loggerTransport.emitSummary(summary);
    this.transport.emitSummary(summary);
  }

  logError(message: string): void {
    this.loggerTransport.emitError(message);
    this.transport.emitError(message);
  }

  setConfig(config: { quiet: boolean; outputFile?: string; format: OutputFormat }): void {
    if (this.transport) {
      this.flushQuietProgress();
    }

    this.quiet = config.quiet;
    this.format = config.format;
    this.transport = this.createTransport(config.format);
    this.transport.reset?.();
    this.resetQuietProgressScheduling();
  }

  resetConfig(): void {
    this.setConfig({ quiet: false, outputFile: undefined, format: 'text' });
  }

  updateQuietProgress(snapshot: QuietProgressSnapshot): void {
    if (!this.quiet || typeof this.transport.emitProgress !== 'function') {
      return;
    }

    this.quietProgressPending = snapshot;
    this.scheduleQuietProgressRender();
  }

  flushQuietProgress(options: { persist?: boolean } = {}): void {
    if (this.quietProgressTimer) {
      clearTimeout(this.quietProgressTimer);
      this.quietProgressTimer = undefined;
    }

    if (this.quietProgressPending) {
      this.performQuietProgressRender();
    }

    this.transport.flushProgress?.(options);
  }

  private createTransport(format: OutputFormat): OutputTransport {
    return format === 'json' ? new JsonConsoleTransport() : new TextConsoleTransport();
  }

  private scheduleQuietProgressRender(): void {
    if (this.quietProgressTimer) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.quietProgressLastTimestamp;
    const delay = elapsed >= QUIET_PROGRESS_INTERVAL_MS ? 0 : QUIET_PROGRESS_INTERVAL_MS - elapsed;

    this.quietProgressTimer = setTimeout(() => {
      this.quietProgressTimer = undefined;
      this.performQuietProgressRender();
    }, delay);
  }

  private performQuietProgressRender(): void {
    const snapshot = this.quietProgressPending;
    this.quietProgressPending = undefined;

    if (!snapshot) {
      return;
    }

    if (typeof this.transport.emitProgress === 'function') {
      this.transport.emitProgress(snapshot);
    }

    this.loggerTransport.emitProgress(snapshot);
    this.quietProgressLastTimestamp = Date.now();
  }

  private resetQuietProgressScheduling(): void {
    if (this.quietProgressTimer) {
      clearTimeout(this.quietProgressTimer);
      this.quietProgressTimer = undefined;
    }

    this.quietProgressPending = undefined;
    this.quietProgressLastTimestamp = -Infinity;
  }
}

const manager = new OutputManager();

export function writePage(page: PageResult, _format: OutputFormat): void {
  manager.writePage(page);
}

export function writeSummary(summary: CrawlSummary, _format: OutputFormat): void {
  manager.writeSummary(summary);
}

export function logError(message: string): void {
  manager.logError(message);
}

export function flushOutputBuffers(): void {
  manager.flushQuietProgress();
}

export function setOutputConfig(config: {
  quiet: boolean;
  outputFile?: string;
  format: OutputFormat;
}): void {
  manager.setConfig(config);
}

export function resetOutputConfig(): void {
  manager.resetConfig();
}

export function updateQuietProgress(snapshot: QuietProgressSnapshot): void {
  manager.updateQuietProgress(snapshot);
}

export function flushQuietProgress(options: { persist?: boolean } = {}): void {
  manager.flushQuietProgress(options);
}

function renderText(page: PageResult): string {
  const lines: string[] = [`VISITED: ${page.url}`];

  if (page.error) {
    lines.push(`  ! ERROR: ${page.error}`);
  }

  if (page.links.length > 0) {
    for (const link of page.links) {
      lines.push(`  - ${link}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderJson(page: PageResult): string {
  return `${JSON.stringify({
    event: 'page',
    url: page.url,
    depth: page.depth,
    links: page.links,
    status: page.status ?? undefined,
    contentType: page.contentType ?? undefined,
    error: page.error ?? undefined,
  })}\n`;
}

function renderTextSummary(summary: CrawlSummary): string {
  const lines: string[] = [
    '',
    '--- Crawl Summary ---',
    `Pages visited: ${summary.pagesVisited}`,
    `Successful pages: ${summary.pagesSucceeded}`,
    `Failed pages: ${summary.pagesFailed}`,
    `Unique URLs discovered: ${summary.uniqueUrlsDiscovered}`,
    `Total links extracted: ${summary.totalLinksExtracted}`,
    `Mean links per page: ${summary.meanLinksPerPage.toFixed(2)}`,
    `Max depth reached: ${summary.maxDepth}`,
    `Duration: ${formatDuration(summary.durationMs)} (${Math.round(summary.durationMs)} ms)`,
    `Actual max concurrency: ${summary.actualMaxConcurrency}`,
    `Peak queue size: ${summary.peakQueueSize}`,
    `Duplicates filtered: ${summary.duplicatesFiltered}`,
    `Cancelled: ${summary.cancelled ? 'yes' : 'no'}`,
    `Retry attempts scheduled: ${summary.retryAttempts}`,
    `Retry successes: ${summary.retrySuccesses}`,
    `Retry failures: ${summary.retryFailures}`,
  ];

  const statusEntries = Object.entries(summary.statusCounts).sort(
    ([statusA], [statusB]) => Number(statusA) - Number(statusB),
  );

  if (statusEntries.length > 0) {
    lines.push('Status codes:');
    for (const [status, count] of statusEntries) {
      lines.push(`  ${status}: ${count}`);
    }
  }

  const failureEntries = Object.entries(summary.failureReasons).sort(([, countA], [, countB]) =>
    countB - countA,
  );

  if (failureEntries.length > 0) {
    lines.push('Failure reasons:');
    for (const [reason, count] of failureEntries) {
      lines.push(`  ${reason}: ${count}`);
    }
  }

  if (summary.failureLog.length > 0) {
    lines.push('Failure log:');
    for (const event of summary.failureLog) {
      const status = event.resolvedOnRetry ? 'resolved' : 'unresolved';
      lines.push(`  [attempt ${event.attempt}] ${event.url} - ${event.reason} (${status})`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderJsonSummary(summary: CrawlSummary): string {
  return `${JSON.stringify({ event: 'summary', summary })}\n`;
}

function renderQuietProgressLine(snapshot: QuietProgressSnapshot): string {
  const parts = [
    `visited:${snapshot.pagesVisited}`,
    `ok:${snapshot.pagesSucceeded}`,
    `fail:${snapshot.pagesFailed}`,
    `unique:${snapshot.uniqueUrlsDiscovered}`,
    `links:${snapshot.totalLinksExtracted}`,
  ];

  if (snapshot.retryAttempts > 0) {
    parts.push(`retry-ok:${snapshot.retrySuccesses}`);
    parts.push(`retry-fail:${snapshot.retryFailures}`);
  }

  return `[quiet] ${parts.join(' ')}`;
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0ms';
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }

  const seconds = durationMs / 1_000;
  if (seconds < 60) {
    const precision = seconds >= 10 ? 1 : 2;
    return `${seconds.toFixed(precision)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const secondsPart =
    remainingSeconds >= 10 ? remainingSeconds.toFixed(0) : remainingSeconds.toFixed(1);
  return `${minutes}m ${secondsPart}s`;
}
