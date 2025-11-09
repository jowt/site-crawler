import {
  CrawlerError,
  ensureCrawlerError,
  type ErrorKind,
  type ErrorSeverity,
} from '../errors.js';

export interface ErrorContext extends Record<string, unknown> {
  stage?: string;
  url?: string;
  depth?: number;
  attempt?: number;
}

export interface ErrorHandlingOptions {
  defaultKind?: ErrorKind;
  defaultSeverity?: ErrorSeverity;
  throwOnFatal?: boolean;
}

export function reportCrawlerError(
  error: unknown,
  context: ErrorContext = {},
  options: ErrorHandlingOptions = {},
): CrawlerError {
  const crawlerError = ensureCrawlerError(error, {
    kind: options.defaultKind ?? 'internal',
    severity: options.defaultSeverity,
    details: context,
  });

  const mergedDetails = {
    ...(crawlerError.details ?? {}),
    ...context,
  } as Record<string, unknown>;

  const message = buildLogMessage(crawlerError, mergedDetails);
  const shouldThrow = options.throwOnFatal ?? true;

  if (crawlerError.severity === 'fatal') {
    console.error(message);
    if (shouldThrow) {
      throw crawlerError;
    }
  } else {
    console.warn(message);
  }

  return crawlerError;
}

function buildLogMessage(error: CrawlerError, details: Record<string, unknown>): string {
  const severity = error.severity ?? 'unknown';
  const parts = [`[${error.kind}/${severity}]`, error.message];
  const contextSuffix = serialiseDetails(details);

  if (contextSuffix) {
    parts.push(`(${contextSuffix})`);
  }

  return parts.join(' ');
}

function serialiseDetails(details: Record<string, unknown>): string | undefined {
  const entries = Object.entries(details).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }

  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
}
