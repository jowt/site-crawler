import { CrawlerError } from '../../errors.js';
import { reportCrawlerError } from '../../util/errorHandler.js';
import { sameSubdomain } from '../url/sameSubdomain.js';
import { CrawlStats } from '../state/stats.js';
import { CrawlQueue } from '../state/queue.js';
import { normalizeUrl } from '../url/normalizeUrl.js';
import { parseLinks } from './parseLinks.js';

export interface ParseResult {
  links: string[];
  error?: CrawlerError;
}

export function parseAndEnqueue(options: {
  html: string;
  baseUrl: URL;
  normalizedVisited: string;
  depth: number;
  queue: CrawlQueue;
  stats: CrawlStats;
}): ParseResult {
  const { html, baseUrl, normalizedVisited, depth, queue, stats } = options;

  try {
    const rawLinks = parseLinks(html);
    const normalizedLinks = new Set<string>();

    for (const rawLink of rawLinks) {
      const normalized = normalizeUrl(rawLink, baseUrl);
      if (!normalized) {
        continue;
      }

      if (!sameSubdomain(normalizedVisited, normalized)) {
        continue;
      }

      normalizedLinks.add(normalized);

      if (queue.enqueueIfNew(normalized, depth + 1)) {
        stats.peakQueueSize = Math.max(stats.peakQueueSize, queue.pending);
      } else {
        stats.duplicatesFiltered += 1;
      }
    }

    return { links: [...normalizedLinks] };
  } catch (error) {
    const crawlerError = reportCrawlerError(
      error,
      { stage: 'parse', url: normalizedVisited, depth },
      { throwOnFatal: false },
    );
    return { links: [], error: crawlerError };
  }
}
