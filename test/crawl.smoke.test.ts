import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { crawlOrchestrator } from '../src/index.js';
import type { CrawlSummary, PageResult } from '../src/types.js';

const siteMap: Record<string, string> = {
  '/': `<!doctype html>
<html>
  <body>
    <a href="/about">About</a>
    <a href="/blog">Blog</a>
  </body>
</html>`,
  '/about': `<!doctype html>
<html>
  <body>
    <a href="/">Home</a>
    <a href="/team">Team</a>
  </body>
</html>`,
  '/team': `<!doctype html>
<html>
  <body>
    <a href="/team?utm_source=test">Tracking Link</a>
    <a href="/">Home</a>
  </body>
</html>`,
  '/blog': `<!doctype html>
<html>
  <body>
    <a href="/blog/post-1">Post 1</a>
    <a href="/blog/post-2/">Post 2</a>
    <a href="https://example.com/external">External</a>
  </body>
</html>`,
  '/blog/post-1': '<html><body><a href="/blog">Back</a></body></html>',
  '/blog/post-2': '<html><body><a href="/blog">Back</a></body></html>',
};

let baseUrl: string;
let serverClose: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? ''}`);
    const path = url.pathname.endsWith('/') && url.pathname !== '/' ? url.pathname.slice(0, -1) : url.pathname;

    if (path === '/robots.txt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('User-agent: *\nCrawl-delay: 1');
      return;
    }

    const html = siteMap[path];

    if (!html) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (typeof address === 'object' && address && typeof address.port === 'number') {
    baseUrl = `http://127.0.0.1:${address.port}`;
  } else {
    throw new Error('Unable to determine server address for tests.');
  }

  serverClose = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
});

afterAll(async () => {
  if (serverClose) {
    await serverClose();
  }
});

describe('crawlOrchestrator smoke test', () => {
  it('crawls the dev site and respects same-subdomain constraint', async () => {
    const visited: PageResult[] = [];
    let summary: CrawlSummary | undefined;

    await crawlOrchestrator(`${baseUrl}/`, {
      concurrency: 4,
      timeoutMs: 5_000,
      stripTracking: true,
      crawlDelayMs: 0,
      handlers: {
        onPage: (page) => {
          visited.push(page);
        },
        onComplete: (stats) => {
          summary = stats;
        },
      },
    });

    const visitedUrls = visited.map((page) => page.url).sort();
    expect(visitedUrls).toContain(`${baseUrl}/`);
    expect(visitedUrls).toContain(`${baseUrl}/blog`);
    expect(visitedUrls).not.toContain('https://example.com/external');

    const teamPage = visited.find((page) => page.url === `${baseUrl}/team`);
    expect(teamPage?.links).toContain(`${baseUrl}/`);
    expect(teamPage?.links).toContain(`${baseUrl}/team?utm_source=test`);
    // Tracking cleanup would remove the utm parameter here when that feature lands.

    expect(summary).toBeDefined();
    expect(summary?.pagesVisited).toBe(visited.length);
    expect(summary?.pagesVisited).toBeGreaterThan(0);
    expect(summary?.pagesFailed).toBe(0);
    expect(summary?.statusCounts['200']).toBeGreaterThan(0);
    expect(summary?.actualMaxConcurrency).toBeLessThanOrEqual(4);
    expect(summary?.durationMs).toBeGreaterThan(0);
    expect(summary?.cancelled).toBe(false);
    expect(summary?.failureReasons).toEqual({});
    expect(summary?.retryAttempts).toBe(0);
    expect(summary?.retrySuccesses).toBe(0);
    expect(summary?.retryFailures).toBe(0);
    expect(summary?.failureLog).toEqual([]);
  });
});
