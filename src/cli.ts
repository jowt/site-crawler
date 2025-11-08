#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';

import { crawlOrchestrator } from './index.js';
import { createConfigurationError } from './errors.js';
import { CrawlOrchestratorConfig, type OutputFormat } from './types.js';
import { reportCrawlerError } from './util/errorHandler.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires -- package.json access for CLI metadata
const pkg = require('../package.json') as { version?: string };


const program = new Command();

program
  .name('monzo-crawler')
  .description('Crawl a single subdomain and report discovered internal links.')
  .version(pkg.version ?? '0.0.0');

program
  .command('crawl')
  .description('Start crawling from the provided URL.')
  .argument('<startUrl>', 'Starting URL for the crawl.')
  // implemented flags
  .option('--concurrency <number>', 'Maximum number of concurrent requests. (default: 8)')
  .option('--max-pages <number>', 'Optional maximum number of pages to visit.')
  .option('--timeout-ms <number>', 'Timeout per request in milliseconds. (default: 10000)')
  .option('--quiet', 'Suppress per-page text output and emit only periodic progress summaries.')
  .option('--log-level <level>', 'Set log verbosity (pino levels: trace|debug|info|warn|error|fatal).')
  .option(
    '--format <format>',
    'Output format to emit (text or json). Defaults to text.',
  )
  // placeholder flags
  .option('--output-file <path>', 'Reserved for future file logging support (currently ignored).')
  .option(
    '--crawl-delay-ms <number>',
    'Placeholder for per-host politeness throttling (currently ignored, robots mocked).',
  )
  .option('--strip-tracking', 'Placeholder for removing tracking query parameters from emitted URLs.')
  .option(
    '--priority <mode>',
    'Placeholder for alternate queue strategies; crawler currently runs breadth-first (FIFO) regardless of mode.',
  )
  .option(
    '--dedupe-by-hash',
    'Placeholder for content-hash deduplication to skip duplicate pages served from different URLs.',
  )
  .action(async (startUrl: string, options: Record<string, unknown>) => {
    try {
      const config = buildConfig(options);
      await crawlOrchestrator(startUrl, config);
    } catch (error) {
      reportCliError(error);
    }
  });

await program.parseAsync(process.argv);

function buildConfig(rawOptions: Record<string, unknown>): CrawlOrchestratorConfig {
  const config: CrawlOrchestratorConfig = {};

  if (rawOptions.concurrency !== undefined) {
    config.concurrency = asNumber(rawOptions.concurrency, 'concurrency');
  }

  if (rawOptions.maxPages !== undefined) {
    config.maxPages = asNumber(rawOptions.maxPages, 'max-pages');
  }

  if (rawOptions.timeoutMs !== undefined) {
    config.timeoutMs = asNumber(rawOptions.timeoutMs, 'timeout-ms');
  }

  if (rawOptions.format !== undefined) {
    const format = String(rawOptions.format).toLowerCase();
    if (format !== 'text' && format !== 'json') {
      throw new Error(`Unsupported format: ${format}`);
    }
    if (!isOutputFormat(format)) {
      throw createConfigurationError(`Unsupported format: ${format}`, { value: format });
    }
    config.format = format;
  }

  // Future priority modes would be parsed from rawOptions.priority here.

  if (rawOptions.stripTracking === true) {
    config.stripTracking = true;
  }

  // Crawl-delay overrides would be coerced from rawOptions.crawlDelayMs when politeness is implemented.

  if (rawOptions.dedupeByHash === true) {
    config.dedupeByHash = true;
  }

  if (rawOptions.quiet === true) {
    config.quiet = true;
  }

  if (rawOptions.outputFile !== undefined) {
    config.outputFile = String(rawOptions.outputFile);
  }

  if (rawOptions.logLevel !== undefined) {
    config.logLevel = String(rawOptions.logLevel);
  }

  return config;
}

function asNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createConfigurationError(`${label} must be a finite number.`, { value });
  }

  return parsed;
}

function reportCliError(error: unknown): void {
  const crawlerError = reportCrawlerError(error, { stage: 'cli' }, {
    defaultKind: 'config',
    defaultSeverity: 'fatal',
    throwOnFatal: false,
  });
  console.error(`Error: ${crawlerError.message}`);
  process.exitCode = 1;
}

function isOutputFormat(value: string): value is OutputFormat {
  return value === 'text' || value === 'json';
}
