# Monzo Web Crawler

Single-subdomain crawler built on Node.js 22. It performs a breadth-first crawl using `p-limit` to limit concurrency, emits per-page output (or quiet progress summaries), and ignores links that leave the starting host/subdomain so the crawl remains on that subdomain.

## How It Works
- `src/cli.ts` parses CLI flags and hands configuration to `crawlOrchestrator`.
- `src/index.ts` normalises the start URL, resolves (mocked) robots crawl-delay, and launches the crawl.
- `src/crawler/crawl.ts` manages the BFS queue, concurrency control, retries, and stats.
- `src/crawler/parsing/parseAndEnqueue.ts` extracts links with Cheerio, normalises them, filters to the same subdomain, and enqueues new work to be queued -> fetched -> parsed.
- `src/util/output.ts` renders per-page logs or quiet-mode progress plus the final summary.

## Running the CLI
Prerequisites: Node.js 22.x (or Docker image below) and npm 10.x.

```bash
# Install dependencies
npm install

# Crawl Monzo's demo site
npm run dev -- crawl https://crawlme.monzo.com

# Increase concurrency and hide per-page output
npm run dev -- crawl https://crawlme.monzo.com --concurrency 256 --quiet

# view failure handling with a limited timeout <200ms
npm run dev -- crawl https://crawlme.monzo.com --concurrency 256 --quiet --timeout-ms 175 

# Target the in-repo demo site (run node scripts/dev-site.mjs first)
npm run dev -- crawl http://localhost:3001 --max-pages 100
```

## Fully Implemented Flags
| Flag                      | Description                                   | Default |
| ---                       | ---                                           | ---     |
| `--concurrency <number>`  | Max in-flight fetches handled by `p-limit`.   | `8`     |
| `--max-pages <number>`    | Hard stop on the number of pages crawled.     | unset   |
| `--timeout-ms <number>`   | Per-request timeout before abort/retry.       | `2000`  |
| `--quiet`                 | Collapse logs into a throttled progress line. | `false` |

## Placeholders for Future Iteration
*No-op today, but preserved as were considered or removed from implementation.*
- `--format json`, `--log-level`, `--output-file` — output hooks that now fall back to text console logging.
- `--strip-tracking`, `--priority`, `--retries`, `--crawl-delay-ms`, `--dedupe-by-hash` — guardrails for future URL normalisation, prioritised queues, politeness knobs, and content hashing.

## Development & Verification
- Build TypeScript to `dist`: `npm run build`
- Run unit/integration tests with coverage: `npm test`
- Lint with ESLint flat config: `npm run lint`
- Format via Prettier: `npm run format`

Vitest smoke tests cover queue behaviour, URL normalisation, HTML parsing, robots handling, and error reporting.

## Docker Support
```bash
docker build -t monzo-crawler .
docker run --rm monzo-crawler https://crawlme.monzo.com --concurrency 256 --quiet
```

The container entrypoint invokes the same `crawl` command; append flags as you would locally.

## Limitations & Possible Extensions

- Implement placeholder flags listed above.
- No robots.txt handling or crawl-delay politeness.
- No adaptive throttling/backoff beyond a single retry for transient errors.
- No dynamic rendering or JavaScript execution (HTML-only).
- No persistence layer for very large crawls (everything is in-memory).
- No graph export or sitemap output yet (possible additions: DOT exports, XML sitemaps).
