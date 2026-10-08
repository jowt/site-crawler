import { describe, expect, it } from 'vitest';

import { parseRobots } from '../src/crawler/network/robots.js';

const url = (path: string) => `https://example.com${path}`;

describe('parseRobots', () => {
  it('allows everything when there are no matching groups', () => {
    const policy = parseRobots('User-agent: googlebot\nDisallow: /');
    expect(policy.isAllowed(url('/anything'))).toBe(true);
    expect(policy.crawlDelayMs).toBeUndefined();
  });

  it('applies the wildcard group and converts crawl-delay to milliseconds', () => {
    const policy = parseRobots('User-agent: *\nDisallow: /private\nCrawl-delay: 1.5');
    expect(policy.isAllowed(url('/private/page'))).toBe(false);
    expect(policy.isAllowed(url('/public'))).toBe(true);
    expect(policy.crawlDelayMs).toBe(1_500);
  });

  it('prefers a group naming our user agent over the wildcard group', () => {
    const policy = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: site-crawler\nDisallow: /admin',
    );
    expect(policy.isAllowed(url('/blog'))).toBe(true);
    expect(policy.isAllowed(url('/admin'))).toBe(false);
  });

  it('uses the longest matching rule, with Allow winning ties', () => {
    const policy = parseRobots(
      'User-agent: *\nDisallow: /docs\nAllow: /docs/public\nDisallow: /tie\nAllow: /tie',
    );
    expect(policy.isAllowed(url('/docs/secret'))).toBe(false);
    expect(policy.isAllowed(url('/docs/public/intro'))).toBe(true);
    expect(policy.isAllowed(url('/tie'))).toBe(true);
  });

  it('supports * and $ wildcards and matches against the query string', () => {
    const policy = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?session=');
    expect(policy.isAllowed(url('/files/report.pdf'))).toBe(false);
    expect(policy.isAllowed(url('/files/report.pdf?v=2'))).toBe(true);
    expect(policy.isAllowed(url('/search?session=abc'))).toBe(false);
  });

  it('ignores comments and treats consecutive user-agent lines as one group', () => {
    const policy = parseRobots('# comment\nUser-agent: a\nUser-agent: *\nDisallow: /x # inline');
    expect(policy.isAllowed(url('/x'))).toBe(false);
  });
});
