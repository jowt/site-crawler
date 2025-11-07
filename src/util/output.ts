import { CrawlSummary, OutputFormat, PageResult } from '../types.js';

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

export function renderJson(page: PageResult): string {
  return `${JSON.stringify({
    page: page.url,
    depth: page.depth,
    links: page.links,
    status: page.status ?? undefined,
    contentType: page.contentType ?? undefined,
    error: page.error ?? undefined,
  })}\n`;
}

export function writePage(page: PageResult, format: OutputFormat): void {
  const rendered = format === 'json' ? renderJson(page) : renderText(page);
  process.stdout.write(rendered);
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

  return `${lines.join('\n')}\n`;
}

export function renderJsonSummary(summary: CrawlSummary): string {
  return `${JSON.stringify({ type: 'summary', stats: summary })}\n`;
}

export function writeSummary(summary: CrawlSummary, format: OutputFormat): void {
  const rendered = format === 'json' ? renderJsonSummary(summary) : renderTextSummary(summary);
  process.stdout.write(rendered);
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
