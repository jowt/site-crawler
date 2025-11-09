import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { createFetchError, createInternalError } from '../src/errors.js';
import { reportCrawlerError } from '../src/util/errorHandler.js';

let warnSpy: MockInstance<(...args: unknown[]) => void>;
let errorSpy: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('reportCrawlerError', () => {
  it('logs recoverable errors without throwing', () => {
    const error = createFetchError('retry later', { url: 'https://example.com' });

    expect(() => {
      reportCrawlerError(error, { stage: 'fetch', attempt: 1 });
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    const message = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(message).toContain('[fetch/recoverable]');
  });

  it('throws on fatal errors by default', () => {
    const fatalError = createInternalError('boom');
    expect(() => reportCrawlerError(fatalError, { stage: 'crawl' })).toThrowError(fatalError);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('can suppress throwing on fatal errors when requested', () => {
    const fatalError = createInternalError('boom');
    expect(() =>
      reportCrawlerError(fatalError, { stage: 'crawl' }, { throwOnFatal: false }),
    ).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('wraps unknown errors as fatal internal errors', () => {
    const result = reportCrawlerError('oops', { stage: 'cli' }, { throwOnFatal: false });
    expect(result.kind).toBe('internal');
    expect(result.severity).toBe('fatal');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
