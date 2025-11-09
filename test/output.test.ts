import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  flushOutputBuffers,
  flushQuietProgress,
  logError,
  resetOutputConfig,
  setOutputConfig,
  updateQuietProgress,
  writeSummary,
} from '../src/util/output.js';

describe('output integration', () => {
  beforeEach(() => {
    setOutputConfig({ quiet: true, outputFile: undefined, format: 'text' });
  });

  afterEach(() => {
    flushQuietProgress();
    flushOutputBuffers();
    resetOutputConfig();
    vi.restoreAllMocks();
  });

  it('surfaces failures while keeping quiet progress responsive', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    logError('crawl failure: https://example.com/fail');

    updateQuietProgress({
      pagesVisited: 1,
      pagesSucceeded: 0,
      pagesFailed: 1,
      uniqueUrlsDiscovered: 1,
      totalLinksExtracted: 0,
      retryAttempts: 1,
      retrySuccesses: 0,
      retryFailures: 1,
    });

    flushQuietProgress();

    writeSummary(
      {
        pagesVisited: 1,
        pagesSucceeded: 0,
        pagesFailed: 1,
        uniqueUrlsDiscovered: 1,
        maxDepth: 0,
        totalLinksExtracted: 0,
        statusCounts: { '500': 1 },
        failureReasons: { 'HTTP 500': 1 },
        durationMs: 125,
        actualMaxConcurrency: 1,
        peakQueueSize: 1,
        duplicatesFiltered: 0,
        meanLinksPerPage: 0,
        cancelled: false,
        retryAttempts: 1,
        retrySuccesses: 0,
        retryFailures: 1,
        failureLog: [
          {
            url: 'https://example.com/fail',
            depth: 0,
            reason: 'HTTP 500',
            attempt: 1,
            resolvedOnRetry: false,
          },
        ],
      },
      'text',
    );

    flushOutputBuffers();

    const combinedStdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    const combinedStderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');

    expect(combinedStderr).toContain('crawl failure: https://example.com/fail');
    expect(combinedStdout).toContain('[quiet]');
    expect(combinedStdout).toContain('--- Crawl Summary ---');
  });
});
