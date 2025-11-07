import { crawl } from './crawler/crawl.js';
import { normalizeUrl } from './crawler/normalizeUrl.js';
import {
  CrawlOptions,
  CrawlOrchestratorConfig,
  OutputFormat,
  PriorityMode,
} from './types.js';

const DEFAULT_OPTIONS: CrawlOptions = {
  concurrency: 8,
  timeoutMs: 1_000,
  format: 'text',
  stripTracking: false,
  priority: 'none',
};

const VALID_FORMATS: OutputFormat[] = ['text', 'json'];
const VALID_PRIORITIES: PriorityMode[] = ['none', 'shallow'];

export async function crawlOrchestrator(
  startUrl: string,
  config: CrawlOrchestratorConfig = {},
): Promise<void> {
  const url = validateStartUrl(startUrl);
  const options = resolveOptions(config);

  const normalizedStart = normalizeUrl(url.href, url, {
    stripTracking: options.stripTracking,
  });

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

  if (config.format && !VALID_FORMATS.includes(config.format)) {
    throw new Error(`Unsupported format: ${config.format}`);
  }

  if (!options.format) {
    options.format = DEFAULT_OPTIONS.format;
  }

  if (!VALID_FORMATS.includes(options.format)) {
    throw new Error(`Unsupported format: ${options.format}`);
  }

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

  return options;
}

function coercePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return Math.trunc(value);
}

export type { CrawlOptions, CrawlOrchestratorConfig, OutputFormat, PriorityMode };
