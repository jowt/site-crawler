import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  flushOutputBuffers,
  renderText,
  renderTextSummary,
  writePage,
  writeSummary,
} from '../src/util/output.js';

const samplePage = {
  url: 'https://example.com/about',
  depth: 1,
  links: ['https://example.com', 'https://example.com/contact'],
  status: 200,
  contentType: 'text/html',
};

const sampleSummary = {
  pagesVisited: 4,
  pagesSucceeded: 3,
  pagesFailed: 1,
  uniqueUrlsDiscovered: 7,
  maxDepth: 3,
  totalLinksExtracted: 12,
  statusCounts: {
    '200': 3,
    '500': 1,
  },
  failureReasons: {
    'This operation was aborted': 1,
    'Timeout': 2,
  },
  durationMs: 1_525,
  actualMaxConcurrency: 8,
  peakQueueSize: 10,
  duplicatesFiltered: 5,
  meanLinksPerPage: 3,
  cancelled: false,
  retryAttempts: 1,
  retrySuccesses: 1,
  retryFailures: 0,
  failureLog: [
    {
      url: 'https://example.com/fail',
      depth: 2,
      reason: 'Timeout',
      attempt: 1,
      resolvedOnRetry: true,
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('output helpers', () => {
  it('renders text format with links and errors', () => {
    const text = renderText({ ...samplePage, error: 'HTTP 500' });
    expect(text).toContain('VISITED: https://example.com/about');
    expect(text).toContain('! ERROR: HTTP 500');
    expect(text).toContain('https://example.com/contact');
  });

  it('writes to stdout using selected formatter', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writePage(samplePage, 'text');
    flushOutputBuffers();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('renders human readable summary output', () => {
    const text = renderTextSummary(sampleSummary);
    expect(text).toContain('--- Crawl Summary ---');
    expect(text).toContain('Pages visited: 4');
    expect(text).toContain('Status codes:');
    expect(text).toContain('500: 1');
    expect(text).toContain('Duration:');
    expect(text).toContain('Actual max concurrency: 8');
    expect(text).toContain('Cancelled: no');
    expect(text).toContain('Failure reasons:');
    expect(text).toContain('This operation was aborted: 1');
    expect(text).toContain('Retry attempts scheduled: 1');
    expect(text).toContain('Retry successes: 1');
    expect(text).toContain('Failure log:');
    expect(text).toContain('[attempt 1] https://example.com/fail - Timeout (resolved)');
  });

  it('writes summary to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writeSummary(sampleSummary, 'text');
    flushOutputBuffers();
    expect(spy).toHaveBeenCalledOnce();
  });
});
