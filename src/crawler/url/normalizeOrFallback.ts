import { normalizeUrl } from './normalizeUrl.js';

export function normalizeOrFallback(raw: URL): string {
  const normalized = normalizeUrl(raw.href, raw);
  return normalized ?? raw.href;
}
