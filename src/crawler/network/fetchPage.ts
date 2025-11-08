import { createFetchError, isCrawlerError, type CrawlerError } from '../../errors.js';

export interface FetchPageOptions {
  timeoutMs: number;
}

const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

export async function fetchPage(url: string, options: FetchPageOptions): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'monzo-crawler/1.0 (+https://github.com/monzo)',
        accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
      },
    });

    return response;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const timedOut = controller.signal.aborted && err.name === 'AbortError';
    const code = extractErrorCode(err);
    const message = timedOut
      ? `Request timed out after ${options.timeoutMs}ms`
      : err.message || 'Request failed';

    throw createFetchError(
      message,
      {
        url,
        timeoutMs: options.timeoutMs,
        ...(typeof code === 'string' ? { code } : {}),
      },
      { cause: err },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isRetryableFetchError(error: unknown): boolean {
  const err = error instanceof Error ? error : undefined;
  if (!err) {
    return false;
  }

  if (err.name === 'AbortError') {
    return false;
  }

  const code = extractErrorCode(err);
  return Boolean(code && RETRYABLE_ERROR_CODES.has(code));
}

function extractErrorCode(error: Error | CrawlerError): string | undefined {
  if (isCrawlerError(error)) {
    const detailsCode = error.details?.code;
    if (typeof detailsCode === 'string') {
      return detailsCode;
    }

    const nested = error.cause;
    if (nested instanceof Error) {
      return extractErrorCode(nested as Error);
    }
  }

  const directCode = (error as { code?: unknown }).code;
  if (typeof directCode === 'string') {
    return directCode;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return extractErrorCode(cause as Error);
  }

  return undefined;
}
