import type { SafeResponse } from './safeFetch';
import type { ParsedRobots } from './robots';
import { extractLinkTags, headSection } from './html';
import type { PlatformFingerprint } from './platform';
import type { Finding } from './types';

/*
 * Check 7 — feed and API surface discovery. Spec §3.7.
 *
 * The cheapest check in the product: everything it needs was already
 * fetched for the reachability precheck (homepage) and for check 1
 * (robots.txt). The finding exists because agency owners routinely do not
 * know these endpoints exist, and they are the cleanest way for an
 * assistant to answer with live prices and opening hours rather than a
 * cached, possibly stale snapshot.
 */

export function checkFeeds(
  control: SafeResponse,
  _robots: ParsedRobots,
  platform: PlatformFingerprint
): Finding[] {
  const origin = new URL(control.url).origin;
  const head = headSection(control.body);
  const linkTags = extractLinkTags(control.body);

  const hasRss =
    linkTags.some((tag) =>
      /\btype\s*=\s*["']application\/(rss|atom)\+xml["']/i.test(tag)
    ) || /<a\b[^>]*\bhref\s*=\s*["'][^"']*\/feed\/?["']/i.test(head);

  const hasWpApi =
    /\brel\s*=\s*["']https?:\/\/api\.w\.org\/?["']/i.test(head) ||
    (control.headers.get('link') ?? '').includes('api.w.org');

  const findings: Finding[] = [];

  if (hasWpApi) {
    findings.push({
      id: 'feeds-wp-api',
      check: 'feeds',
      tag: 'opportunity',
      title: 'A WordPress REST API is already on',
      detail:
        'Most site owners have never seen it, but it means an assistant can answer with live ' +
        'prices, opening hours, and service details instead of a cached snapshot. It is the ' +
        'cleanest way for an AI to read this site - cleaner than scraping the pages your ' +
        'visitors see.',
      evidence: {
        quote: '<link rel="https://api.w.org/" …>',
        source: `${origin}/`,
      },
      remediation:
        'Nothing to fix. If a client ever asks for an AI feature that needs live data, this is ' +
        'where to start rather than building a crawler.',
      weight: 45,
    });
  } else if (hasRss) {
    findings.push({
      id: 'feeds-rss',
      check: 'feeds',
      tag: 'opportunity',
      title: 'An RSS/Atom feed is available',
      detail:
        'Posts and updates are already machine-readable, which is a lighter way for an ' +
        'assistant to keep up with new content than re-crawling pages.',
      evidence: { quote: 'rel="alternate" type="application/rss+xml"', source: `${origin}/` },
      remediation: 'Nothing to fix. Worth knowing it exists before planning any AI work.',
      weight: 35,
    });
  }

  /*
   * Deliberately no `good` finding for the absence of feeds: an absence is
   * not news, and a finding that tells a non-technical reader "your site
   * has no RSS" creates a problem where there is not one.
   */
  return findings;
}

/** Surface the fingerprint for other checks without re-importing this module. */
export type { PlatformFingerprint };
