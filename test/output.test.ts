import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLogger, setLoggerInstance, type LoggerLike } from '../src/logger.js';
import {
  flushOutputBuffers,
  flushQuietProgress,
  logError,
  resetOutputConfig,
  setOutputConfig,
  updateQuietProgress,
  writeSummary,
} from '../src/util/output.js';

interface LogEntry {
  level: string;
  args: unknown[];
}

const realLogger = getLogger();
let logEntries: LogEntry[];

describe('output integration', () => {
  beforeEach(() => {
    logEntries = [];
    const testLogger: LoggerLike = {
      info: (...args: unknown[]) => logEntries.push({ level: 'info', args }),
      error: (...args: unknown[]) => logEntries.push({ level: 'error', args }),
      warn: (...args: unknown[]) => logEntries.push({ level: 'warn', args }),
      debug: (...args: unknown[]) => logEntries.push({ level: 'debug', args }),
      trace: (...args: unknown[]) => logEntries.push({ level: 'trace', args }),
      fatal: (...args: unknown[]) => logEntries.push({ level: 'fatal', args }),
      child: () => testLogger,
    };

    setLoggerInstance(testLogger);
    setOutputConfig({ quiet: true, outputFile: undefined, format: 'text' });
  });

  afterEach(() => {
    flushQuietProgress();
    flushOutputBuffers();
    resetOutputConfig();
    setLoggerInstance(realLogger);
    vi.restoreAllMocks();
  });

  it('surfaces failures while keeping quiet progress responsive', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

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

    expect(logEntries.some((entry) => entry.level === 'error')).toBe(true);
    expect(logEntries.some((entry) => entry.level === 'info')).toBe(true);
    expect(stdoutSpy.mock.calls.map((call) => String(call[0])).join('')).toContain(
      '--- Crawl Summary ---',
    );
  });
});
