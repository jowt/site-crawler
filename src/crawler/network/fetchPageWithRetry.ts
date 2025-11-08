import { CrawlerError, ensureCrawlerError } from '../../errors.js';
import { fetchPage, isRetryableFetchError } from './fetchPage.js';

export interface FetchOutcome {
  ok: boolean;
  url: string;
  status: number | null;
  contentType?: string;
  html?: string;
  failureReason?: string;
  error?: CrawlerError;
}

const DEFAULT_MAX_RETRIES = 1;
const RETRY_BACKOFF_MS = 100;

export async function fetchPageWithRetry(url: string, timeoutMs: number): Promise<FetchOutcome> {
  let lastError: CrawlerError | undefined;

  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchPage(url, { timeoutMs });
      const contentType = response.headers.get('content-type') ?? undefined;

      if (!response.ok) {
        return {
          ok: false,
          url: response.url,
          status: response.status,
          contentType,
          failureReason: `HTTP ${response.status}`,
        };
      }

      const isHtml = contentType?.toLowerCase().includes('text/html');
      const html = isHtml ? await response.text() : undefined;

      return {
        ok: true,
        url: response.url,
        status: response.status,
        contentType,
        html,
      };
    } catch (error) {
      const crawlerError = ensureCrawlerError(error, { kind: 'fetch' });
      lastError = crawlerError;

      if (attempt === DEFAULT_MAX_RETRIES || !isRetryableFetchError(error)) {
        return {
          ok: false,
          url,
          status: null,
          failureReason: crawlerError.message,
          error: crawlerError,
        };
      }

      await delay(RETRY_BACKOFF_MS * (attempt + 1));
    }
  }

  return {
    ok: false,
    url,
    status: null,
    failureReason: lastError?.message ?? 'Request failed',
    error: lastError,
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
