# Monzo Web Crawler

## Problem Statement

Build a simple, production-ready web crawler that, given a starting URL, visits every URL on the same subdomain. For each visited page, emit the URL and the deduplicated set of discovered internal links. The crawler must offer text and NDJSON output modes, configurable concurrency, request timeouts, optional tracking-parameter stripping, and a shallow-priority queue. Crawling frameworks are disallowed; only focused libraries for HTTP, HTML parsing, and small utilities may be used.

## Design Overview

- **Crawl loop** – A BFS-oriented queue feeds a `p-limit` promise pool. Each completed fetch pushes new links back into the queue while respecting the `--priority` mode (`none` = FIFO, `shallow` = depth priority).
- **Networking** – Native `fetch` (Node 22) with `AbortController` enforces per-request timeouts. A lightweight retry (one attempt) handles transient network glitches.
- **Normalization** – `normalizeUrl` lowercases scheme/host, resolves relatives, strips fragments and default ports, normalizes trailing slashes, and optionally removes known tracking params.
- **Logging** – Structured JSON logs via [Pino](https://getpino.io) capture per-page visits, quiet-mode progress, retries, and the final summary for downstream aggregation (disabled by default unless `--log-level` is set).
- **Error handling** – Custom crawler error types classify fetch, parse, configuration, and internal failures; recoverable issues are logged and recorded, while fatal conditions short-circuit the crawl.
- **Subdomain guard** – `sameSubdomain` enforces hostname equality (case-insensitive) so the crawl never leaves the originating subdomain.

## Why These Choices

- **Manual queue + `p-limit`** keeps control over traversal order and simplifies concurrency for an I/O-bound workload compared with worker threads/cluster. The queue is explicit and easily testable.
- **Cheerio** offers predictable HTML parsing without bringing in a full crawling framework.
- **Conservative normalization** avoids surprising users by preserving query param ordering unless `--strip-tracking` is requested.
- **No crawling frameworks** ensures transparency and keeps the codebase small, per requirements.

## CLI Usage

```bash
npm run dev -- crawl https://crawlme.monzo.com --concurrency 8
npm run dev -- crawl https://crawlme.monzo.com --format json --log-level info
npm run dev -- crawl https://crawlme.monzo.com --quiet --strip-tracking
```

### Options

| Option | Description |
| --- | --- |
| `--concurrency <n>` | Max concurrent requests (default: 8) |
| `--max-pages <n>` | Optional cap on pages visited |
| `--timeout-ms <n>` | Per-request timeout in milliseconds (default: 10000) |
| `--quiet` | Suppress per-page text output; emit throttled progress summaries instead |
| `--log-level <level>` | Adjust Pino log verbosity (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` default) |
| `--format <text\|json>` | Choose text (default) or newline-delimited JSON output |
| `--output-file <path>` | Placeholder for file-based logging (currently ignored) |
| `--strip-tracking` | Remove `utm_*`, `gclid`, `fbclid` params |
| `--priority <none|shallow>` | FIFO (default) or depth-first bias |

## Prerequisites

- Node.js **22.x** or newer (the project relies on built-in `fetch` + `File` implementations).
- npm 10.x (bundled with current Node LTS).
- Optional: `nvm install 22 && nvm use 22` to align local runtime with Docker and CI images.

## Development Workflow

1. Install dependencies: `npm install`
2. Start the local dev site (optional): `node scripts/dev-site.mjs`
3. Run the crawler locally: `npm run dev -- crawl http://localhost:3001`

## Testing & Quality

- Unit and integration tests: `npm test`
- Linting: `npm run lint`
- Formatting: `npm run format`
- Type-safe build: `npm run build`

`npm test` covers normalization edge cases, subdomain checks, HTML parsing, and an end-to-end smoke test against an in-memory HTTP server with cycles, query params, and external links.

## Docker

```bash
docker build -t monzo-crawler .
docker run --rm monzo-crawler https://crawlme.monzo.com --concurrency 8
```

The image default entrypoint runs the `crawl` command; pass CLI flags after the image name.

## Limitations & Possible Extensions

- No robots.txt handling or crawl-delay politeness.
- No adaptive throttling/backoff beyond a single retry for transient errors.
- No persistence layer for very large crawls (everything is in-memory).
- No graph export or sitemap output yet (possible additions: DOT exports, XML sitemaps).
- Future enhancements could include per-host semaphore pools and checkpoint/resume abilities for long crawls.
