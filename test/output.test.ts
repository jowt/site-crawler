import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  renderJson,
  renderJsonSummary,
  renderText,
  renderTextSummary,
  writePage,
  writeSummary,
} from '../src/util/output.js';

const samplePage = {
  url: 'https://example.com/about',
  depth: 1,
  links: ['https://example.com', 'https://example.com/contact'],
  status: 200,
  contentType: 'text/html',
};

const sampleSummary = {
  pagesVisited: 4,
  pagesSucceeded: 3,
  pagesFailed: 1,
  uniqueUrlsDiscovered: 7,
  maxDepth: 3,
  totalLinksExtracted: 12,
  statusCounts: {
    '200': 3,
    '500': 1,
  },
  failureReasons: {
    'This operation was aborted': 1,
    'Timeout': 2,
  },
  durationMs: 1_525,
  actualMaxConcurrency: 8,
  peakQueueSize: 10,
  duplicatesFiltered: 5,
  meanLinksPerPage: 3,
  cancelled: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('output helpers', () => {
  it('renders text format with links and errors', () => {
    const text = renderText({ ...samplePage, error: 'HTTP 500' });
    expect(text).toContain('VISITED: https://example.com/about');
    expect(text).toContain('! ERROR: HTTP 500');
    expect(text).toContain('https://example.com/contact');
  });

  it('renders NDJSON format', () => {
    const json = renderJson(samplePage);
    expect(json.trim()).toBe(
      JSON.stringify({
        page: 'https://example.com/about',
        depth: 1,
        links: ['https://example.com', 'https://example.com/contact'],
        status: 200,
        contentType: 'text/html',
        error: undefined,
      }),
    );
  });

  it('writes to stdout using selected formatter', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writePage(samplePage, 'text');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('renders human readable summary output', () => {
    const text = renderTextSummary(sampleSummary);
    expect(text).toContain('--- Crawl Summary ---');
    expect(text).toContain('Pages visited: 4');
    expect(text).toContain('Status codes:');
    expect(text).toContain('500: 1');
    expect(text).toContain('Duration:');
    expect(text).toContain('Actual max concurrency: 8');
    expect(text).toContain('Cancelled: no');
    expect(text).toContain('Failure reasons:');
    expect(text).toContain('This operation was aborted: 1');
  });

  it('renders NDJSON summary output', () => {
    const json = renderJsonSummary(sampleSummary);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('summary');
    expect(parsed.stats.pagesFailed).toBe(1);
    expect(parsed.stats.durationMs).toBe(1_525);
    expect(parsed.stats.failureReasons['Timeout']).toBe(2);
  });

  it('writes summary to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writeSummary(sampleSummary, 'json');
    expect(spy).toHaveBeenCalledOnce();
  });
});
