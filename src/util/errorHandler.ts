import { getLogger } from '../logger.js';
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

  const logger = getLogger();
  const mergedDetails = {
    ...context,
    ...(crawlerError.details ?? {}),
  };

  const payload = {
    event: 'error' as const,
    kind: crawlerError.kind,
    severity: crawlerError.severity,
    message: crawlerError.message,
    details: mergedDetails,
  };

  if (crawlerError.severity === 'fatal') {
    logger.error(payload, crawlerError.message);
    if (options.throwOnFatal ?? true) {
      throw crawlerError;
    }
  } else {
    logger.warn(payload, crawlerError.message);
  }

  return crawlerError;
}
