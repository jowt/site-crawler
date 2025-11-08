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

let quietMode = false;
let activeFormat: OutputFormat = 'text';
let quietProgressTimer: NodeJS.Timeout | undefined;
let quietProgressPending: QuietProgressSnapshot | undefined;
let quietProgressLastTimestamp = -Infinity;
let quietProgressLastLength = 0;
let quietProgressRendered = false;

export function writePage(page: PageResult, _format: OutputFormat): void {
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

  if (quietMode) {
    logger.debug(payload, 'page processed');
    return;
  }

  logger.info(payload, 'page processed');

  if (activeFormat === 'json') {
    process.stdout.write(renderJson(page));
    return;
  }

  process.stdout.write(renderText(page));
}

export function writeSummary(summary: CrawlSummary, _format: OutputFormat): void {
  const logger = getLogger();
  flushQuietProgress({ persist: activeFormat === 'text' });
  logger.info({ event: 'summary', summary }, 'crawl summary emitted');

  if (activeFormat === 'json') {
    process.stdout.write(renderJsonSummary(summary));
    return;
  }

  process.stdout.write(renderTextSummary(summary));
}

export function logError(message: string): void {
  const logger = getLogger();
  logger.error({ event: 'error' }, message);

  if (activeFormat === 'json') {
    process.stdout.write(`${JSON.stringify({ event: 'error', message })}\n`);
    return;
  }

  const payload = message.endsWith('\n') ? message : `${message}\n`;
  process.stderr.write(payload);
}

export function flushOutputBuffers(): void {
  flushQuietProgress();
}

export function setOutputConfig(config: {
  quiet: boolean;
  outputFile?: string;
  format: OutputFormat;
}): void {
  if (quietMode && !config.quiet) {
    flushQuietProgress();
  }

  quietMode = config.quiet;
  activeFormat = config.format;
  resetQuietProgressState();
}

export function resetOutputConfig(): void {
  setOutputConfig({ quiet: false, outputFile: undefined, format: 'text' });
}

export function updateQuietProgress(snapshot: QuietProgressSnapshot): void {
  if (!quietMode) {
    return;
  }

  quietProgressPending = snapshot;
  scheduleQuietProgressRender();
}

export function flushQuietProgress(options: { persist?: boolean } = {}): void {
  if (quietProgressTimer) {
    clearTimeout(quietProgressTimer);
    quietProgressTimer = undefined;
  }

  if (quietProgressPending) {
    performQuietProgressRender();
  }

  if (!quietProgressRendered || activeFormat !== 'text') {
    return;
  }

  if (options.persist) {
    process.stdout.write('\n');
  } else if (quietProgressLastLength > 0) {
    process.stdout.write(`\r${' '.repeat(quietProgressLastLength)}\r`);
  }

  quietProgressRendered = false;
  quietProgressLastLength = 0;
  quietProgressLastTimestamp = -Infinity;
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

function scheduleQuietProgressRender(): void {
  if (quietProgressTimer) {
    return;
  }

  const now = Date.now();
  const elapsed = now - quietProgressLastTimestamp;
  const delay = elapsed >= QUIET_PROGRESS_INTERVAL_MS ? 0 : QUIET_PROGRESS_INTERVAL_MS - elapsed;

  quietProgressTimer = setTimeout(() => {
    quietProgressTimer = undefined;
    performQuietProgressRender();
  }, delay);
}

function performQuietProgressRender(): void {
  const snapshot = quietProgressPending;
  quietProgressPending = undefined;

  if (!snapshot) {
    return;
  }

  emitQuietProgress(snapshot);
  quietProgressLastTimestamp = Date.now();
}

function emitQuietProgress(snapshot: QuietProgressSnapshot): void {
  const logger = getLogger();
  logger.info(
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

  if (activeFormat === 'json') {
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
    return;
  }

  const line = renderQuietProgressLine(snapshot);
  const padded = padQuietProgressLine(line);
  process.stdout.write(`\r${padded}`);
  quietProgressLastLength = padded.length;
  quietProgressRendered = true;
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

function padQuietProgressLine(text: string): string {
  if (quietProgressLastLength > text.length) {
    return `${text}${' '.repeat(quietProgressLastLength - text.length)}`;
  }

  return text;
}

function resetQuietProgressState(): void {
  if (quietProgressTimer) {
    clearTimeout(quietProgressTimer);
    quietProgressTimer = undefined;
  }

  quietProgressPending = undefined;
  quietProgressLastTimestamp = -Infinity;
  quietProgressLastLength = 0;
  quietProgressRendered = false;
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
