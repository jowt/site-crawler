import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLogger, setLoggerInstance, type LoggerLike } from '../src/logger.js';
import {
  flushOutputBuffers,
  flushQuietProgress,
  logError,
  resetOutputConfig,
  setOutputConfig,
  updateQuietProgress,
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

interface LogEntry {
  level: string;
  args: unknown[];
}

let capturedLogs: LogEntry[];

const realLogger = getLogger();

beforeEach(() => {
  const { logger, entries } = createTestLogger();
  capturedLogs = entries;
  setLoggerInstance(logger);
});

afterEach(() => {
  flushQuietProgress();
  flushOutputBuffers();
  resetOutputConfig();
  setLoggerInstance(realLogger);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('output helpers', () => {
  it('writes text output to stdout when not quiet', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    writePage(samplePage, 'text');

    const concatenated = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(concatenated).toContain('VISITED: https://example.com/about');
  });

  it('writes json output when requested', () => {
    setOutputConfig({ quiet: false, outputFile: undefined, format: 'json' });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    writePage(samplePage, 'json');

    const concatenated = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    const line = concatenated.trim().split('\n').filter(Boolean)[0];
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('page');
    expect(parsed.url).toBe(samplePage.url);
  });

  it('emits structured page events', () => {
    writePage(samplePage, 'text');
    expect(capturedLogs).toHaveLength(1);
    const [payload, message] = capturedLogs[0].args as [Record<string, unknown>, string];
    expect(capturedLogs[0].level).toBe('info');
    expect(payload).toMatchObject({
      event: 'page',
      url: samplePage.url,
      depth: 1,
      linkCount: 2,
    });
    expect(message).toBe('page processed');
  });

  it('records structured summary output', () => {
    writeSummary(sampleSummary, 'text');
    expect(capturedLogs).toHaveLength(1);
    const [payload, message] = capturedLogs[0].args as [Record<string, unknown>, string];
    expect(payload.event).toBe('summary');
    expect(payload.summary).toMatchObject({ pagesVisited: 4, retryAttempts: 1 });
    expect(message).toBe('crawl summary emitted');
  });

  it('writes text summary to stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writeSummary(sampleSummary, 'text');
    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('--- Crawl Summary ---');
  });

  it('writes json summary when requested', () => {
    setOutputConfig({ quiet: false, outputFile: undefined, format: 'json' });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writeSummary(sampleSummary, 'json');
    const lines = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    const parsed = JSON.parse(lines.trim());
    expect(parsed.event).toBe('summary');
    expect(parsed.summary.pagesVisited).toBe(4);
  });

  it('suppresses per-page logs in quiet mode and emits aggregated progress', () => {
    vi.useFakeTimers();
    setOutputConfig({ quiet: true, outputFile: undefined, format: 'text' });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writePage(samplePage, 'text');
    expect(capturedLogs).toHaveLength(1);
    expect(capturedLogs[0].level).toBe('debug');

    updateQuietProgress({
      pagesVisited: 5,
      pagesSucceeded: 5,
      pagesFailed: 0,
      uniqueUrlsDiscovered: 5,
      totalLinksExtracted: 20,
      retryAttempts: 0,
      retrySuccesses: 0,
      retryFailures: 0,
    });

    vi.runOnlyPendingTimers();

  expect(capturedLogs).toHaveLength(2);
  const [, progressMessage] = capturedLogs;
  const [payload, message] = progressMessage.args as [Record<string, unknown>, string];
  expect(progressMessage.level).toBe('info');
  expect(payload.event).toBe('progress');
  expect(payload).toMatchObject({ pagesVisited: 5, mode: 'quiet' });
  expect(message).toBe('quiet progress update');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(String(stdoutSpy.mock.calls[0][0])).toMatch(/^\r\[quiet]/);
  });

  it('logs errors via the shared logger', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logError('something went wrong');
    expect(capturedLogs).toHaveLength(1);
    const [payload, message] = capturedLogs[0].args as [Record<string, unknown>, string];
    expect(capturedLogs[0].level).toBe('error');
    expect(payload).toMatchObject({ event: 'error' });
    expect(message).toBe('something went wrong');
    expect(stderrSpy).toHaveBeenCalledWith('something went wrong\n');
  });

  it('retains the output-file flag as a placeholder', () => {
    expect(() =>
      setOutputConfig({ quiet: false, outputFile: '/tmp/crawler-placeholder.log', format: 'text' }),
    ).not.toThrow();
  });
});

function createTestLogger(): { logger: LoggerLike; entries: LogEntry[] } {
  const entries: LogEntry[] = [];

  const logger: LoggerLike = {
    info: (...args: unknown[]) => entries.push({ level: 'info', args }),
    error: (...args: unknown[]) => entries.push({ level: 'error', args }),
    warn: (...args: unknown[]) => entries.push({ level: 'warn', args }),
    debug: (...args: unknown[]) => entries.push({ level: 'debug', args }),
    trace: (...args: unknown[]) => entries.push({ level: 'trace', args }),
    fatal: (...args: unknown[]) => entries.push({ level: 'fatal', args }),
    child: () => logger,
  };

  return { logger, entries };
}
