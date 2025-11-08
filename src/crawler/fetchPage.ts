import { FetchPageResult } from '../types.js';

export interface FetchPageOptions {
  timeoutMs: number;
  maxRetries?: number;
}

const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

export async function fetchPage(url: string, options: FetchPageOptions): Promise<FetchPageResult> {
  const maxAttempts = Math.max(1, (options.maxRetries ?? 1) + 1);
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'monzo-crawler/1.0 (+https://github.com/monzo)',
          accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
          'accept-encoding': 'gzip, deflate, br', // Allow servers to serve compressed payloads for faster transfers.
        },
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') ?? undefined;
      const isHtml = contentType?.toLowerCase().includes('text/html');
      const html = isHtml ? await response.text() : undefined;

      return {
        url: response.url,
        status: response.status,
        ok: response.ok,
        contentType,
        html,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      if (controller.signal.aborted && err.name === 'AbortError') {
        break;
      }

      if (attempt === maxAttempts || !isRetryable(err)) {
        break;
      }

      await delay(100 * attempt);
    }
  }

  return {
    url,
    status: null,
    ok: false,
    error: lastError,
  };
}

function isRetryable(error: Error): boolean {
  const code = extractErrorCode(error);
  return Boolean(code && RETRYABLE_ERROR_CODES.has(code));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractErrorCode(error: Error): string | undefined {
  const directCode = (error as { code?: unknown }).code;
  if (typeof directCode === 'string') {
    return directCode;
  }

  const cause = (error as { cause?: unknown }).cause as { code?: unknown } | undefined;
  if (cause && typeof cause.code === 'string') {
    return cause.code;
  }

  return undefined;
}
