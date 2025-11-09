export type OutputFormat = 'text' | 'json'; // 'json' placeholder currently falls back to text output.

export type PriorityMode = 'none'; // Future queue strategies (e.g. 'shallow') would extend this union.

export interface FailureEvent {
  url: string;
  depth: number;
  reason: string;
  attempt: number;
  resolvedOnRetry: boolean;
}

export interface CrawlOptions {
  concurrency: number;
  maxPages?: number;
  timeoutMs: number;
  format: OutputFormat;
  stripTracking: boolean;
  priority: PriorityMode;
  crawlDelayMs: number;
  dedupeByHash: boolean;
  quiet: boolean;
  outputFile?: string;
  logLevel: string; // Placeholder: no-op until logging transport grows richer controls.
}

export interface PageResult {
  url: string;
  depth: number;
  links: string[];
  status?: number;
  contentType?: string;
  error?: string;
}

export interface CrawlSummary {
  pagesVisited: number;
  pagesSucceeded: number;
  pagesFailed: number;
  uniqueUrlsDiscovered: number;
  maxDepth: number;
  totalLinksExtracted: number;
  statusCounts: Record<string, number>;
  failureReasons: Record<string, number>;
  durationMs: number;
  actualMaxConcurrency: number;
  peakQueueSize: number;
  duplicatesFiltered: number;
  meanLinksPerPage: number;
  cancelled: boolean;
  retryAttempts: number;
  retrySuccesses: number;
  retryFailures: number;
  failureLog: FailureEvent[];
}

export interface CrawlQueueItem {
  url: string;
  depth: number;
  attempt: number;
}

export type CrawlOrchestratorOptions = Partial<CrawlOptions>;

export interface CrawlHandlers {
  onPage(result: PageResult): void;
  // these have been implemented for future extension but are not called by consumers yet
  onError?(error: Error, context: { url: string; depth: number }): void;
  onComplete?(summary: CrawlSummary): void;
}

export interface CrawlOrchestratorConfig extends CrawlOrchestratorOptions {
  handlers?: CrawlHandlers;
}
