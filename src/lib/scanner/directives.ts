/*
 * Robots directives carried in HTTP headers and meta tags.
 *
 * This is the THIRD mechanism that can stop an assistant using a site, after
 * robots.txt and CDN blocking, and it is the quietest of the three. An
 * `X-Robots-Tag: noindex` left on by a staging config is invisible in the
 * page, invisible in robots.txt, and invisible in the CDN dashboard. The
 * site looks completely normal in a browser.
 *
 * See docs/creative-bandit-ai-readiness-scan.md §3.1.
 */

export interface RobotsDirectives {
  /** Directive -> where we found it, for the evidence field. */
  found: Map<string, string>;
  /** Agent-scoped directives, e.g. `googlebot: noindex`. */
  scoped: { agent: string; directive: string; source: string }[];
}

/** Directives that change what an assistant may do with the page. */
export const BLOCKING_DIRECTIVES = new Set([
  'noindex',
  'none', // shorthand for noindex, nofollow
  'nosnippet',
  'noarchive',
  'noai',
  'noimageai',
]);

function addDirective(
  target: RobotsDirectives,
  raw: string,
  source: string
): void {
  // A value can be `noindex, nofollow` or `googlebot: noindex, nofollow`.
  for (const part of raw.split(',')) {
    const piece = part.trim().toLowerCase();
    if (!piece) continue;

    const colon = piece.indexOf(':');
    // `max-snippet:0` has a colon but is not agent-scoped, so only treat it
    // as scoped when the left side is not a known directive prefix.
    if (colon > 0 && !piece.startsWith('max-') && !piece.startsWith('unavailable_after')) {
      const agent = piece.slice(0, colon).trim();
      const directive = piece.slice(colon + 1).trim();
      if (directive) {
        target.scoped.push({ agent, directive, source });
        continue;
      }
    }

    if (!target.found.has(piece)) target.found.set(piece, source);
  }
}

/**
 * Collect directives from the response headers and the document head.
 *
 * `Headers.get` folds repeated headers into one comma-joined value, which is
 * exactly the syntax we already split on, so multiple X-Robots-Tag headers
 * need no special handling.
 */
export function collectDirectives(headers: Headers, html: string): RobotsDirectives {
  const result: RobotsDirectives = { found: new Map(), scoped: [] };

  const header = headers.get('x-robots-tag');
  if (header) addDirective(result, header, 'X-Robots-Tag header');

  // Only look in the head; a `<meta name="robots">` in body content is not a
  // directive, and article text discussing noindex should not trip the check.
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1] : html.slice(0, 50_000);

  const metaPattern = /<meta\b[^>]*>/gi;
  for (const tag of head.match(metaPattern) ?? []) {
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!name) continue;
    // `robots` is universal; the rest are agent-specific meta tags.
    const isRobots =
      name === 'robots' ||
      name === 'googlebot' ||
      name === 'googlebot-news' ||
      name.endsWith('bot');
    if (!isRobots) continue;

    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!content) continue;

    const source = name === 'robots' ? '<meta name="robots">' : `<meta name="${name}">`;
    if (name === 'robots') {
      addDirective(result, content, source);
    } else {
      for (const part of content.split(',')) {
        const directive = part.trim().toLowerCase();
        if (directive) result.scoped.push({ agent: name, directive, source });
      }
    }
  }

  return result;
}

/** Directives that actually block, with where each was found. */
export function blockingDirectives(
  directives: RobotsDirectives
): { directive: string; source: string; agent?: string }[] {
  const out: { directive: string; source: string; agent?: string }[] = [];

  for (const [directive, source] of directives.found) {
    if (BLOCKING_DIRECTIVES.has(directive)) out.push({ directive, source });
    // max-snippet:0 forbids any text snippet, which is the same practical
    // outcome as nosnippet for an assistant trying to quote the page.
    if (/^max-snippet\s*:\s*0$/.test(directive)) out.push({ directive, source });
  }

  for (const { agent, directive, source } of directives.scoped) {
    if (BLOCKING_DIRECTIVES.has(directive) || /^max-snippet\s*:\s*0$/.test(directive)) {
      out.push({ directive, source, agent });
    }
  }

  return out;
}
