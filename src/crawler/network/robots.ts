import { fetchPage } from './fetchPage.js';

export const USER_AGENT_TOKEN = 'site-crawler';

export interface RobotsPolicy {
  isAllowed(url: string): boolean;
  crawlDelayMs?: number;
}

interface Rule {
  allow: boolean;
  pattern: string;
}

export const ALLOW_ALL: RobotsPolicy = { isAllowed: () => true };

/**
 * Parses robots.txt for the most specific matching group (our token, else `*`).
 * Supports Allow/Disallow with `*` and `$` wildcards (longest match wins, Allow wins ties)
 * and Crawl-delay in seconds.
 */
export function parseRobots(text: string, userAgent = USER_AGENT_TOKEN): RobotsPolicy {
  const groups: { agents: string[]; rules: Rule[]; crawlDelayMs?: number }[] = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) {
      continue;
    }

    if ((field === 'allow' || field === 'disallow') && value) {
      current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelayMs = Math.round(seconds * 1_000);
      }
    }
  }

  const token = userAgent.toLowerCase();
  const group =
    groups.find((g) => g.agents.some((agent) => agent !== '*' && token.includes(agent))) ??
    groups.find((g) => g.agents.includes('*'));

  if (!group) {
    return ALLOW_ALL;
  }

  const matchers = group.rules.map((rule) => ({ ...rule, regex: patternToRegex(rule.pattern) }));

  return {
    crawlDelayMs: group.crawlDelayMs,
    isAllowed(url: string): boolean {
      const { pathname, search } = new URL(url);
      const target = pathname + search;
      let best: { allow: boolean; length: number } | undefined;

      for (const matcher of matchers) {
        if (!matcher.regex.test(target)) {
          continue;
        }
        const length = matcher.pattern.length;
        if (!best || length > best.length || (length === best.length && matcher.allow)) {
          best = { allow: matcher.allow, length };
        }
      }

      return best?.allow ?? true;
    },
  };
}

/** Fetches /robots.txt for the start URL's origin. Missing or unreachable files allow everything. */
export async function loadRobotsPolicy(startUrl: URL, timeoutMs: number): Promise<RobotsPolicy> {
  try {
    const response = await fetchPage(new URL('/robots.txt', startUrl).href, { timeoutMs });
    if (!response.ok) {
      return ALLOW_ALL;
    }
    return parseRobots(await response.text());
  } catch {
    return ALLOW_ALL;
  }
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}
