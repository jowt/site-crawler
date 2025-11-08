import { crawl } from './crawler/crawl.js';
import { normalizeUrl } from './crawler/normalizeUrl.js';
import { resolveCrawlDelayMs } from './crawler/robots.js';
import {
  CrawlOptions,
  CrawlOrchestratorConfig,
  OutputFormat,
  PriorityMode,
} from './types.js';

const DEFAULT_OPTIONS: CrawlOptions = {
  concurrency: 8,
  timeoutMs: 10_000,
  format: 'text',
  stripTracking: false, // Reserved for future tracking-parameter stripping support.
  priority: 'none', // Reserved for future queue prioritisation modes.
  crawlDelayMs: 0,
  dedupeByHash: false, // Reserved for future content-hash de-duplication.
};

const VALID_PRIORITIES: PriorityMode[] = ['none']; // Additional modes reserved for future implementations.

export async function crawlOrchestrator(
  startUrl: string,
  config: CrawlOrchestratorConfig = {},
): Promise<void> {
  const url = validateStartUrl(startUrl);
  const options = resolveOptions(config);

  if (config.crawlDelayMs === undefined) {
    const robotsDelay = await resolveCrawlDelayMs(url, options.timeoutMs);
    if (robotsDelay !== undefined) {
      options.crawlDelayMs = robotsDelay;
    }
  }

  const normalizedStart = normalizeUrl(url.href, url);
  // When strip-tracking returns, this is where we would supply that preference.

  if (!normalizedStart) {
    throw new Error('Unable to normalize the starting URL.');
  }

  await crawl({
    normalizedStart,
    options,
    handlers: config.handlers,
  });
}

function validateStartUrl(startUrl: string): URL {
  let url: URL;

  try {
    url = new URL(startUrl);
  } catch {
    throw new Error(`Invalid URL: ${startUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Start URL must use http or https protocol.');
  }

  return url;
}

function resolveOptions(config: CrawlOrchestratorConfig): CrawlOptions {
  const options: CrawlOptions = {
    ...DEFAULT_OPTIONS,
    ...config,
  };

  options.concurrency = coercePositiveInteger(
    config.concurrency ?? DEFAULT_OPTIONS.concurrency,
    'concurrency',
  );
  options.timeoutMs = coercePositiveInteger(
    config.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
    'timeout-ms',
  );

  if (config.maxPages !== undefined) {
    options.maxPages = coercePositiveInteger(config.maxPages, 'max-pages');
  }

  options.format = DEFAULT_OPTIONS.format; // Placeholder: in future we would honor config.format here.

  if (config.priority && !VALID_PRIORITIES.includes(config.priority)) {
    throw new Error(`Unsupported priority mode: ${config.priority}`);
  }

  if (!options.priority) {
    options.priority = DEFAULT_OPTIONS.priority;
  }

  if (!VALID_PRIORITIES.includes(options.priority)) {
    throw new Error(`Unsupported priority mode: ${options.priority}`);
  }

  options.stripTracking = config.stripTracking ?? DEFAULT_OPTIONS.stripTracking;
  options.crawlDelayMs = coerceNonNegativeInteger(
    config.crawlDelayMs ?? DEFAULT_OPTIONS.crawlDelayMs,
    'crawl-delay',
  );
  options.dedupeByHash = config.dedupeByHash ?? DEFAULT_OPTIONS.dedupeByHash;

  return options;
}

function coercePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return Math.trunc(value);
}

export type { CrawlOptions, CrawlOrchestratorConfig, OutputFormat, PriorityMode };

function coerceNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be zero or a positive integer.`);
  }

  return Math.trunc(value);
}
