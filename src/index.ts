import { crawl } from './crawler/crawl.js';
import { normalizeUrl } from './crawler/url/normalizeUrl.js';
import { resolveCrawlDelayMs } from './crawler/network/robots.js';
import { createConfigurationError } from './errors.js';
import {
  CrawlOptions,
  CrawlOrchestratorConfig,
  OutputFormat,
  PriorityMode,
} from './types.js';

const DEFAULT_OPTIONS: CrawlOptions = {
  concurrency: 8,
  timeoutMs: 2_000,
  format: 'text',
  stripTracking: false, // Reserved for future tracking-parameter stripping support.
  priority: 'none', // Reserved for future queue prioritisation modes.
  crawlDelayMs: 0,
  dedupeByHash: false, // Reserved for future content-hash de-duplication.
  quiet: false,
  outputFile: undefined,
  logLevel: 'silent',
};

const VALID_PRIORITIES: PriorityMode[] = ['none']; // Additional modes reserved for future implementations.
const VALID_FORMATS: OutputFormat[] = ['text', 'json'];

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
    throw createConfigurationError('Unable to normalize the starting URL.', { startUrl: url.href });
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
    throw createConfigurationError(`Invalid URL: ${startUrl}`, { startUrl });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createConfigurationError('Start URL must use http or https protocol.', {
      protocol: url.protocol,
      startUrl,
    });
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

  const requestedFormat = config.format ?? DEFAULT_OPTIONS.format;
  if (!VALID_FORMATS.includes(requestedFormat)) {
    throw createConfigurationError(`Unsupported format: ${requestedFormat}`, {
      format: requestedFormat,
    });
  }
  options.format = requestedFormat;

  if (config.priority && !VALID_PRIORITIES.includes(config.priority)) {
    throw createConfigurationError(`Unsupported priority mode: ${config.priority}`, {
      priority: config.priority,
    });
  }

  if (!options.priority) {
    options.priority = DEFAULT_OPTIONS.priority;
  }

  if (!VALID_PRIORITIES.includes(options.priority)) {
    throw createConfigurationError(`Unsupported priority mode: ${options.priority}`, {
      priority: options.priority,
    });
  }

  options.stripTracking = config.stripTracking ?? DEFAULT_OPTIONS.stripTracking;
  options.crawlDelayMs = coerceNonNegativeInteger(
    config.crawlDelayMs ?? DEFAULT_OPTIONS.crawlDelayMs,
    'crawl-delay',
  );
  options.dedupeByHash = config.dedupeByHash ?? DEFAULT_OPTIONS.dedupeByHash;
  options.quiet = config.quiet ?? DEFAULT_OPTIONS.quiet;
  options.outputFile = config.outputFile ?? DEFAULT_OPTIONS.outputFile;
  options.logLevel = config.logLevel ?? DEFAULT_OPTIONS.logLevel;

  return options;
}

function coercePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw createConfigurationError(`${field} must be a positive integer.`, { value, field });
  }

  return Math.trunc(value);
}

export type { CrawlOptions, CrawlOrchestratorConfig, OutputFormat, PriorityMode };

function coerceNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw createConfigurationError(`${field} must be zero or a positive integer.`, { value, field });
  }

  return Math.trunc(value);
}
