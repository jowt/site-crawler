# site-crawler

[![CI](https://github.com/jowt/site-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/jowt/site-crawler/actions/workflows/ci.yml)

A concurrent, polite web crawler for a single subdomain, written in TypeScript on Node.js 22.
Given a start URL, it crawls breadth-first, stays on the starting host, honours `robots.txt`,
and reports every page it visits with the links found on it, followed by a crawl summary.

## Features

- **Bounded concurrency** with `p-limit`, and a measured peak concurrency in the summary.
- **Same-subdomain scope:** links to other hosts are reported but never followed.
- **URL normalisation and de-duplication**, so `/blog`, `/blog/` and `/blog#top` are crawled once.
- **robots.txt support:** `Allow` / `Disallow` with `*` and `$` wildcards (longest match wins),
  user-agent groups, and `Crawl-delay`, which spaces request starts across all workers.
- **Resilience:** per-request timeouts, one queue-level retry for transient failures, and a
  failure log that shows which errors recovered on retry.
- **Graceful cancellation:** Ctrl+C stops scheduling and still prints the summary.
- **Quiet mode:** a throttled progress line instead of per-page output for large crawls.

## How it works

```text
start URL ─► robots.txt ─► queue (BFS) ─► fetch (timeout, retry) ─► parse links (Cheerio)
                              ▲                                          │
                              └──── normalise, same host, allowed, new ◄─┘
```

| Module | Responsibility |
| --- | --- |
| `src/cli.ts` | Parses flags with Commander and builds the crawl config. |
| `src/index.ts` | Validates the start URL, loads `robots.txt` and starts the crawl. |
| `src/crawler/crawl.ts` | Runs the queue, concurrency, crawl delay, retries and stats. |
| `src/crawler/network/robots.ts` | Parses `robots.txt` into an allow/deny policy and crawl delay. |
| `src/crawler/parsing/parseAndEnqueue.ts` | Extracts, normalises, filters and enqueues links. |
| `src/util/output.ts` | Per-page output, quiet-mode progress and the final summary. |

## Usage

Requires Node.js 22+ and npm 10+.

```bash
npm install

# Crawl a site
npm run dev -- crawl https://example.com

# Higher concurrency with progress output only
npm run dev -- crawl https://example.com --concurrency 64 --quiet

# Try it against the bundled demo site (run `node scripts/dev-site.mjs` first)
npm run dev -- crawl http://localhost:3001 --max-pages 100
```

| Flag | Description | Default |
| --- | --- | --- |
| `--concurrency <n>` | Maximum in-flight requests. | `8` |
| `--max-pages <n>` | Stop after this many pages. | unlimited |
| `--timeout-ms <n>` | Per-request timeout before abort and retry. | `2000` |
| `--crawl-delay-ms <n>` | Minimum gap between request starts. Overrides `robots.txt`. | from `robots.txt`, else `0` |
| `--quiet` | Replace per-page output with a progress line. | off |

### Docker

```bash
docker build -t site-crawler .
docker run --rm site-crawler https://example.com --concurrency 32 --quiet
```

## Development

```bash
npm test         # Vitest unit and integration tests, with coverage
npm run lint     # ESLint (flat config)
npm run build    # Compile to dist/
```

The integration test starts a local HTTP server and checks scope, de-duplication, `robots.txt`
rules and summary statistics end to end. CI runs lint, type checks, tests and the build on every push.

## Possible extensions

- JSON output, file output and log levels (the flags are reserved in the CLI).
- Tracking-parameter stripping and content-hash de-duplication.
- Adaptive backoff on `429` / `503` responses, and `Retry-After` support.
- Persistent queue for very large crawls, and sitemap or graph export.
