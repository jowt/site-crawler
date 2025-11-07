export type OutputFormat = 'text' | 'json';

export type PriorityMode = 'none' | 'shallow';

export interface CrawlOptions {
  concurrency: number;
  maxPages?: number;
  timeoutMs: number;
  format: OutputFormat;
  stripTracking: boolean;
  priority: PriorityMode;
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
}

export interface CrawlQueueItem {
  url: string;
  depth: number;
}

export interface CrawlOrchestratorOptions extends Partial<CrawlOptions> {}

export interface CrawlHandlers {
  onPage(result: PageResult): void;
  onError?(error: Error, context: { url: string; depth: number }): void;
  onComplete?(summary: CrawlSummary): void;
}

export interface CrawlOrchestratorConfig extends CrawlOrchestratorOptions {
  handlers?: CrawlHandlers;
}

export interface FetchPageResult {
  url: string;
  status: number | null;
  ok: boolean;
  html?: string;
  contentType?: string;
  error?: Error;
}
