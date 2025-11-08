const DEFAULT_PORT_MAP: Record<string, string> = {
  'http:': '80',
  'https:': '443',
};

export function normalizeUrl(raw: string, base: URL): string | null {
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

    // param (tracking??) stripping would slot in here if we extend the crawler later.

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
