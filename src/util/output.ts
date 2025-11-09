import { CrawlSummary, OutputFormat, PageResult } from '../types.js';

const QUIET_PROGRESS_INTERVAL_MS = 250;

type QuietProgressSnapshot = {
  pagesVisited: number;
  pagesSucceeded: number;
  pagesFailed: number;
  uniqueUrlsDiscovered: number;
  totalLinksExtracted: number;
  retryAttempts: number;
  retrySuccesses: number;
  retryFailures: number;
};

let quietMode = false;
let warnedAboutJson = false;
let quietProgressTimer: ReturnType<typeof setTimeout> | undefined;
let quietProgressPending: QuietProgressSnapshot | undefined;
let quietProgressLastTimestamp = -Infinity;
let quietProgressLastLength = 0;
let quietProgressRendered = false;

export function writePage(page: PageResult, _format: OutputFormat): void {
  if (quietMode) {
    return;
  }

  process.stdout.write(renderText(page));
}

export function writeSummary(summary: CrawlSummary, _format: OutputFormat): void {
  flushQuietProgress({ persist: true });
  process.stdout.write(renderTextSummary(summary));
}

export function logError(message: string): void {
  flushQuietProgress();
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

  if (config.format !== 'text' && !warnedAboutJson) {
    console.warn('JSON output is not implemented yet; falling back to plain text.');
    warnedAboutJson = true; //TODO maybe too much statefulness
  }

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

  if (!quietProgressRendered) {
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
