export interface NormalizeOptions {
  stripTracking: boolean;
}

const DEFAULT_PORT_MAP: Record<string, string> = {
  'http:': '80',
  'https:': '443',
};

const TRACKING_PARAM_PATTERNS = [/^utm_/i, /^gclid$/i, /^fbclid$/i];

export function normalizeUrl(raw: string, base: URL, options: NormalizeOptions): string | null {
  try {
    const url = new URL(raw, base);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';

    removeDefaultPort(url);
    normalizePath(url);

    if (options.stripTracking) {
      stripTracking(url.searchParams);
      const search = url.searchParams.toString();
      url.search = search ? `?${search}` : '';
    }

    return url.toString();
  } catch {
    return null;
  }
}

function removeDefaultPort(url: URL): void {
  const defaultPort = DEFAULT_PORT_MAP[url.protocol];
  if (defaultPort && url.port === defaultPort) {
    url.port = '';
  }
}

function normalizePath(url: URL): void {
  if (url.pathname === '/') {
    return;
  }

  const trimmed = url.pathname.replace(/\/+$/, '');
  url.pathname = trimmed.length > 0 ? trimmed : '/';
}

export function stripTracking(params: URLSearchParams): void {
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))) {
      params.delete(key);
    }
  }
}
