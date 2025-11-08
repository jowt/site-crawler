import { CrawlSummary, OutputFormat, PageResult } from '../types.js';

const STDOUT_BATCH_SIZE = 512;
const STDERR_BATCH_SIZE = 128;

const stdoutBuffer: string[] = [];

const stderrBuffer: string[] = [];

export function renderText(page: PageResult): string {
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

export function writePage(page: PageResult, _format: OutputFormat): void {
  // Alternate formats would conditionally render based on _format once implemented.
  const rendered = renderText(page);
  queueStdout(rendered);
}

export function renderTextSummary(summary: CrawlSummary): string {
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

export function writeSummary(summary: CrawlSummary, _format: OutputFormat): void {
  // Future summary formats (e.g. JSON) would branch on _format here.
  const rendered = renderTextSummary(summary);
  queueStdout(rendered, { forceFlush: true });
}

export function logError(message: string): void {
  queueStderr(message.endsWith('\n') ? message : `${message}\n`);
}

export function flushOutputBuffers(): void {
  flushStdoutBuffer();
  flushStderrBuffer();
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
  const secondsPart = remainingSeconds >= 10 ? remainingSeconds.toFixed(0) : remainingSeconds.toFixed(1);
  return `${minutes}m ${secondsPart}s`;
}

function queueStdout(chunk: string, options: { forceFlush?: boolean } = {}): void {
  stdoutBuffer.push(chunk);
  if (options.forceFlush || stdoutBuffer.length >= STDOUT_BATCH_SIZE) {
    flushStdoutBuffer();
    return;
  }
}

function flushStdoutBuffer(): void {
  if (stdoutBuffer.length === 0) {
    return;
  }

  const payload = stdoutBuffer.join('');
  stdoutBuffer.length = 0;
  process.stdout.write(payload);
}

function queueStderr(chunk: string, options: { forceFlush?: boolean } = {}): void {
  stderrBuffer.push(chunk);
  if (options.forceFlush || stderrBuffer.length >= STDERR_BATCH_SIZE) {
    flushStderrBuffer();
    return;
  }
}

function flushStderrBuffer(): void {
  if (stderrBuffer.length === 0) {
    return;
  }

  const payload = stderrBuffer.join('');
  stderrBuffer.length = 0;
  process.stderr.write(payload);
}
