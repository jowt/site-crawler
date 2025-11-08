export async function resolveCrawlDelayMs(_startUrl: URL, _timeoutMs: number): Promise<number> {
  // In production we would fetch and parse robots.txt here to honour the site's crawl delay.
  // For this exercise we mock the behaviour and always return 0 so the global per-domain delay applies.
  return 0;
}
