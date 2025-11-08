import pino, { type DestinationStream, type LoggerOptions } from 'pino';

export interface LoggerLike {
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  trace(...args: unknown[]): void;
  fatal(...args: unknown[]): void;
  child(bindings: Record<string, unknown>): LoggerLike;
}

export interface LoggerConfiguration {
  level?: LoggerOptions['level'];
  base?: LoggerOptions['base'];
  destination?: DestinationStream;
}

const DEFAULT_LEVEL: LoggerOptions['level'] = 'silent';
const DEFAULT_BASE = { service: 'monzo-crawler' } as const;

let activeLogger: LoggerLike = createPinoInstance();

export function configureLogger(config: LoggerConfiguration = {}): void {
  const { level = DEFAULT_LEVEL, base = DEFAULT_BASE, destination } = config;
  activeLogger = createPinoInstance({ level, base }, destination);
}

export function setLoggerInstance(logger: LoggerLike): void {
  activeLogger = logger;
}

export function getLogger(): LoggerLike {
  return activeLogger;
}

function createPinoInstance(
  options: Partial<LoggerOptions> = {},
  destination?: DestinationStream,
): LoggerLike {
  const merged: LoggerOptions = {
    level: options.level ?? DEFAULT_LEVEL,
    base: options.base ?? DEFAULT_BASE,
  };

  if (destination) {
    return pino(merged, destination);
  }

  return pino(merged);
}
