#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';

import { crawlOrchestrator } from './index.js';
import { CrawlOrchestratorConfig, OutputFormat, PriorityMode } from './types.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires -- package.json access for CLI metadata
const pkg = require('../package.json') as { version?: string };

const VALID_FORMATS: OutputFormat[] = ['text', 'json'];
const VALID_PRIORITIES: PriorityMode[] = ['none', 'shallow'];

const program = new Command();

program
  .name('monzo-crawler')
  .description('Crawl a single subdomain and report discovered internal links.')
  .version(pkg.version ?? '0.0.0');

program
  .command('crawl')
  .description('Start crawling from the provided URL.')
  .argument('<startUrl>', 'Starting URL for the crawl.')
  .option('--concurrency <number>', 'Maximum number of concurrent requests. (default: 8)')
  .option('--max-pages <number>', 'Optional maximum number of pages to visit.')
  .option('--timeout-ms <number>', 'Timeout per request in milliseconds. (default: 10000)')
  .option('--format <format>', 'Output format: text | json. (default: text)')
  .option('--strip-tracking', 'Strip known tracking query parameters from URLs.')
  .option('--priority <mode>', 'Queue priority strategy: none | shallow. (default: none)')
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
    const format = String(rawOptions.format) as OutputFormat;
    if (!VALID_FORMATS.includes(format)) {
      throw new Error(`Unsupported format: ${rawOptions.format}`);
    }
    config.format = format;
  }

  if (rawOptions.priority !== undefined) {
    const priority = String(rawOptions.priority) as PriorityMode;
    if (!VALID_PRIORITIES.includes(priority)) {
      throw new Error(`Unsupported priority mode: ${rawOptions.priority}`);
    }
    config.priority = priority;
  }

  if (rawOptions.stripTracking === true) {
    config.stripTracking = true;
  }

  return config;
}

function asNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return parsed;
}

function reportCliError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}
