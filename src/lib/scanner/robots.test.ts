import { describe, it, expect } from 'vitest';
import { parseRobots, isAllowed, groupFor, blocksEverything } from './robots';

describe('parseRobots', () => {
  it('treats an HTML soft-404 as no robots.txt', () => {
    const parsed = parseRobots('<!DOCTYPE html><html><head><title>404</title></head></html>');
    expect(parsed.absent).toBe(true);
    expect(parsed.groups).toHaveLength(0);
  });

  it('groups consecutive user-agent lines together', () => {
    const parsed = parseRobots(`
User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

User-agent: *
Disallow: /wp-admin/
`);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].agents).toEqual(['gptbot', 'claudebot']);
    expect(parsed.groups[1].agents).toEqual(['*']);
  });

  it('collects sitemaps globally, not per group', () => {
    const parsed = parseRobots(`
User-agent: *
Disallow:
Sitemap: https://example.com/sitemap_index.xml
`);
    expect(parsed.sitemaps).toEqual(['https://example.com/sitemap_index.xml']);
  });

  it('strips comments and records line numbers', () => {
    const parsed = parseRobots(`# leading comment
User-agent: GPTBot
Disallow: /private # trailing comment
`);
    expect(parsed.groups[0].rules[0]).toMatchObject({ path: '/private', line: 3 });
  });

  it('parses crawl-delay', () => {
    const parsed = parseRobots('User-agent: *\nCrawl-delay: 10\n');
    expect(parsed.groups[0].crawlDelay).toBe(10);
  });
});

describe('groupFor — most specific group wins', () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /

User-agent: GPTBot
Disallow: /admin/
`);

  it('does NOT apply the wildcard block to an agent with its own group', () => {
    // The bug that would make us report the opposite of the truth.
    const group = groupFor(robots, 'GPTBot');
    expect(group?.agents).toEqual(['gptbot']);
    expect(isAllowed(robots, 'GPTBot', '/').allowed).toBe(true);
  });

  it('falls back to the wildcard for an agent without its own group', () => {
    expect(isAllowed(robots, 'PerplexityBot', '/').allowed).toBe(false);
  });
});

describe('isAllowed — precedence', () => {
  it('blocks the whole site on Disallow: /', () => {
    const robots = parseRobots('User-agent: GPTBot\nDisallow: /\n');
    const verdict = isAllowed(robots, 'GPTBot', '/');
    expect(verdict.allowed).toBe(false);
    expect(verdict.rule?.line).toBe(2);
  });

  it('treats an empty Disallow as full access', () => {
    const robots = parseRobots('User-agent: GPTBot\nDisallow:\n');
    expect(isAllowed(robots, 'GPTBot', '/anything').allowed).toBe(true);
  });

  it('lets the longest matching rule win', () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /
Allow: /blog/
`);
    expect(isAllowed(robots, 'GPTBot', '/blog/post').allowed).toBe(true);
    expect(isAllowed(robots, 'GPTBot', '/about').allowed).toBe(false);
  });

  it('gives Allow the tie on equal length', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /x\nAllow: /x\n');
    expect(isAllowed(robots, 'GPTBot', '/x').allowed).toBe(true);
  });

  it('handles * wildcards and $ anchors', () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /*.pdf$
Disallow: /tmp/*/private
`);
    expect(isAllowed(robots, 'GPTBot', '/files/report.pdf').allowed).toBe(false);
    expect(isAllowed(robots, 'GPTBot', '/files/report.pdf.html').allowed).toBe(true);
    expect(isAllowed(robots, 'GPTBot', '/tmp/a/private').allowed).toBe(false);
  });

  it('allows everything when there is no robots.txt', () => {
    expect(isAllowed(parseRobots(''), 'GPTBot', '/').allowed).toBe(true);
  });

  it('matches agent tokens case-insensitively', () => {
    const robots = parseRobots('User-agent: gptbot\nDisallow: /\n');
    expect(isAllowed(robots, 'GPTBot', '/').allowed).toBe(false);
  });

  it('ignores rules that appear before any user-agent line', () => {
    const robots = parseRobots('Disallow: /\nUser-agent: *\nAllow: /\n');
    expect(isAllowed(robots, 'GPTBot', '/').allowed).toBe(true);
  });
});

describe('blocksEverything', () => {
  it('detects a blanket block', () => {
    const robots = parseRobots('User-agent: GPTBot\nDisallow: /\n');
    expect(blocksEverything(robots.groups[0])).toBe(true);
  });

  it('does not call a partial block blanket', () => {
    const robots = parseRobots('User-agent: GPTBot\nDisallow: /\nAllow: /blog/\n');
    expect(blocksEverything(robots.groups[0])).toBe(false);
  });
});
