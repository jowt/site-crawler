export type ErrorKind =
  | 'fetch'
  | 'parse'
  | 'normalize'
  | 'config'
  | 'output'
  | 'internal';

export type ErrorSeverity = 'recoverable' | 'fatal';

export interface CrawlerErrorProps {
  message: string;
  kind: ErrorKind;
  severity?: ErrorSeverity;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class CrawlerError extends Error {
  readonly kind: ErrorKind;
  readonly severity: ErrorSeverity;
  readonly details?: Record<string, unknown>;

  constructor({ message, kind, severity = 'recoverable', details, cause }: CrawlerErrorProps) {
    super(message, cause ? { cause } : undefined);
    this.name = `${capitalize(kind)}Error`;
    this.kind = kind;
    this.severity = severity;
    this.details = details;
  }
}

export function isCrawlerError(value: unknown): value is CrawlerError {
  return value instanceof CrawlerError;
}

export function ensureCrawlerError(
  error: unknown,
  fallback: Partial<CrawlerErrorProps> & Pick<CrawlerErrorProps, 'kind'> = { kind: 'internal' },
): CrawlerError {
  if (isCrawlerError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new CrawlerError({
    message,
    kind: fallback.kind,
    severity: fallback.severity ?? 'fatal',
    details: fallback.details,
    cause: error instanceof Error ? error : undefined,
  });
}

export function createFetchError(
  message: string,
  details: Record<string, unknown> = {},
  options: { severity?: ErrorSeverity; cause?: unknown } = {},
): CrawlerError {
  return new CrawlerError({
    message,
    kind: 'fetch',
    severity: options.severity ?? 'recoverable',
    details,
    cause: options.cause,
  });
}

export function createParseError(
  message: string,
  details: Record<string, unknown> = {},
  options: { severity?: ErrorSeverity; cause?: unknown } = {},
): CrawlerError {
  return new CrawlerError({
    message,
    kind: 'parse',
    severity: options.severity ?? 'recoverable',
    details,
    cause: options.cause,
  });
}

export function createConfigurationError(
  message: string,
  details: Record<string, unknown> = {},
  options: { cause?: unknown } = {},
): CrawlerError {
  return new CrawlerError({
    message,
    kind: 'config',
    severity: 'fatal',
    details,
    cause: options.cause,
  });
}

export function createInternalError(
  message: string,
  details: Record<string, unknown> = {},
  options: { cause?: unknown; severity?: ErrorSeverity } = {},
): CrawlerError {
  return new CrawlerError({
    message,
    kind: 'internal',
    severity: options.severity ?? 'fatal',
    details,
    cause: options.cause,
  });
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
