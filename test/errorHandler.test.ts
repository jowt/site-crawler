import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFetchError, createInternalError } from '../src/errors.js';
import { getLogger, setLoggerInstance, type LoggerLike } from '../src/logger.js';
import { reportCrawlerError } from '../src/util/errorHandler.js';

interface LogCall {
  level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal';
  args: unknown[];
}

const realLogger = getLogger();
let logCalls: LogCall[];

beforeEach(() => {
  logCalls = [];
  const testLogger: LoggerLike = {
    info: (...args: unknown[]) => logCalls.push({ level: 'info', args }),
    warn: (...args: unknown[]) => logCalls.push({ level: 'warn', args }),
    error: (...args: unknown[]) => logCalls.push({ level: 'error', args }),
    debug: (...args: unknown[]) => logCalls.push({ level: 'debug', args }),
    trace: (...args: unknown[]) => logCalls.push({ level: 'trace', args }),
    fatal: (...args: unknown[]) => logCalls.push({ level: 'fatal', args }),
    child: () => testLogger,
  };

  setLoggerInstance(testLogger);
});

afterEach(() => {
  setLoggerInstance(realLogger);
});

describe('reportCrawlerError', () => {
  it('logs recoverable errors without throwing', () => {
    const error = createFetchError('retry later', { url: 'https://example.com' });

    expect(() => {
      reportCrawlerError(error, { stage: 'fetch', attempt: 1 });
    }).not.toThrow();

    expect(logCalls).toHaveLength(1);
    expect(logCalls[0].level).toBe('warn');
    const [payload] = logCalls[0].args as [Record<string, unknown>];
    expect(payload).toMatchObject({
      event: 'error',
      kind: 'fetch',
      severity: 'recoverable',
    });
  });

  it('throws on fatal errors by default', () => {
    const fatalError = createInternalError('boom');
    expect(() => reportCrawlerError(fatalError, { stage: 'crawl' })).toThrowError(fatalError);
    expect(logCalls).toHaveLength(1);
    expect(logCalls[0].level).toBe('error');
  });

  it('can suppress throwing on fatal errors when requested', () => {
    const fatalError = createInternalError('boom');
    expect(() =>
      reportCrawlerError(fatalError, { stage: 'crawl' }, { throwOnFatal: false }),
    ).not.toThrow();
    expect(logCalls).toHaveLength(1);
    expect(logCalls[0].level).toBe('error');
  });

  it('wraps unknown errors as fatal internal errors', () => {
    const result = reportCrawlerError('oops', { stage: 'cli' }, { throwOnFatal: false });
    expect(result.kind).toBe('internal');
    expect(result.severity).toBe('fatal');
    expect(logCalls).toHaveLength(1);
  });
});
