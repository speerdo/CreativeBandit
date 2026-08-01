import { safeFetch, type SafeResponse } from './safeFetch';
import type { ParsedRobots } from './robots';
import type { PlatformFingerprint } from './platform';
import { sitemapCandidates } from './platform';

/*
 * Sitemap discovery, sampling, and the shared page fetcher.
 *
 * Phase 2's plumbing: schema, metadata, and image/identity checks all need
 * the same page bodies. Fetching each URL once and parsing it in memory for
 * every check keeps the network spend to one pass, which is where the
 * budget actually lives. See spec §3.2 and §5.
 */

/** How many pages we sample, including the homepage. Spec budget owner. */
export const MAX_SAMPLE_PAGES = 24;
const FETCH_CONCURRENCY = 4;
const PAGE_TIMEOUT_MS = 7000;

export interface SampledSitemap {
  urls: string[];
  /** Where the list came from, for finding evidence. */
  source: 'robots.txt' | 'sitemap' | 'crawl-fallback' | 'none';
  sourceUrl?: string;
  /** True when a sitemap was requested and none could be found. */
  sitemapMissing: boolean;
}

/**
 * Find the sitemap, in the order spec §3.2 prescribes, stopping at the
 * first that yields URLs. Gzipped sitemaps are common on larger sites; a
 * WordPress soft-404 (200 + HTML) is the usual false positive.
 */
export async function discoverSitemap(
  origin: string,
  robots: ParsedRobots,
  platform: PlatformFingerprint
): Promise<SampledSitemap> {
  const candidates: { url: string; source: SampledSitemap['source'] }[] = [
    ...robots.sitemaps.map((url) => ({ url, source: 'robots.txt' as const })),
    ...sitemapCandidates(platform, origin).map((url) => ({ url, source: 'sitemap' as const })),
  ];

  for (const candidate of candidates) {
    let urls: string[] = [];
    try {
      urls = await fetchSitemapUrls(candidate.url, origin);
    } catch {
      continue;
    }
    if (urls.length > 0) {
      return { urls, source: candidate.source, sourceUrl: candidate.url, sitemapMissing: false };
    }
  }

  return { urls: [], source: 'none', sitemapMissing: true };
}

/**
 * Download and URL-extract a sitemap, following one level of sitemap-index
 * recursion, exactly as spec §3.2 requires.
 */
async function fetchSitemapUrls(url: string, origin: string): Promise<string[]> {
  const response = await fetchMaybeGzip(url);
  if (response.status !== 200) return [];

  const body = response.body;
  if (looksLikeHtml(body)) return [];

  // An index delegates to child sitemaps; follow one level down.
  if (/<sitemapindex[\s>]/i.test(body)) {
    const children = extractLocs(body).slice(0, 3);
    const settled = await Promise.allSettled(
      children.map((child) => fetchUrlsetLocs(child, origin))
    );
    return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  }

  return filterSameOrigin(extractLocs(body), origin);
}

async function fetchUrlsetLocs(url: string, origin: string): Promise<string[]> {
  try {
    const response = await fetchMaybeGzip(url);
    if (response.status !== 200 || looksLikeHtml(response.body)) return [];
    return filterSameOrigin(extractLocs(response.body), origin);
  } catch {
    return [];
  }
}

/**
 * safeFetch passes through whatever Content-Encoding undici negotiated,
 * which decodes gzip in the normal case. A misconfigured CDN that returns
 * the gzip bytes untouched produces a body full of mojibake; extractLocs
 * then finds no <loc> tags and the sitemap cleanly contributes nothing,
 * which is the failure mode we want anyway.
 */
async function fetchMaybeGzip(url: string): Promise<SafeResponse> {
  return safeFetch(url, {
    accept: 'application/xml,text/xml,*/*;q=0.5',
    timeoutMs: 6000,
  });
}

/*
 * `<loc>` values, with CDATA and XML entities unwrapped.
 *
 * The CDATA handling is load-bearing, not defensive. Both dominant WordPress
 * SEO plugins wrap the URL:
 *
 *   <loc><![CDATA[https://example.com/post-sitemap.xml]]></loc>
 *
 * An earlier `[^<]+?` pattern could not match that at all, because the
 * content begins with `<`. Sitemap discovery therefore returned nothing on
 * most WordPress sites, which produced a confident and false "No sitemap
 * exists" AND silently cost every check that depends on the page sample -
 * schema, metadata, images and identity. Found against wpbeginner.com
 * (AIOSEO); Yoast emits the same shape.
 */
export function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const value = match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'");

    if (value) locs.push(value);
  }

  return locs;
}

/** A sitemap is only useful if it points at the site we are scanning. */
function filterSameOrigin(urls: string[], origin: string): string[] {
  return urls.filter((url) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  });
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 500).toLowerCase().trimStart();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

/**
 * Choose the URLs to scan. Homepage first, then however many of the
 * sitemap's own ordering fit the budget; a sitemap's order already
 * privileges the pages a site owner cares about over the archive tail.
 * Falls back to a shallow homepage-link crawl when there is no sitemap at
 * all, so the downstream checks still have something to work with.
 */
export function sampleUrls(sitemap: SampledSitemap, homepageHtml: string, origin: string): string[] {
  const homepage = `${origin}/`;
  const chosen = [homepage];

  let pool: string[];
  if (sitemap.urls.length > 0) {
    pool = sitemap.urls;
  } else {
    pool = extractInternalLinks(homepageHtml, origin);
  }

  for (const url of pool) {
    if (chosen.length >= MAX_SAMPLE_PAGES) break;
    if (!chosen.includes(url)) chosen.push(url);
  }

  return chosen;
}

/** Internal links from the homepage, for the no-sitemap fallback only. */
function extractInternalLinks(html: string, origin: string): string[] {
  const hrefs = html.match(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi) ?? [];
  const links: string[] = [];
  for (const tag of hrefs) {
    const href = tag.match(/\bhref\s*=\s*["']([^"'#]+)["']/i)?.[1];
    if (!href) continue;
    try {
      const url = new URL(href, origin);
      if (url.origin !== origin) continue;
      // Skip files, feeds, and admin paths - they are not pages.
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|xml|json)$/i.test(url.pathname)) continue;
      if (url.pathname.startsWith('/wp-admin') || url.pathname.startsWith('/feed')) continue;
      const normalised = url.href.replace(/\/$/, '/') ;
      if (!links.includes(normalised)) links.push(normalised);
    } catch {
      continue;
    }
  }
  return links;
}

/**
 * Fetch the page sample with bounded concurrency and per-page timeouts.
 * One fetch, all downstream checks parse the result - this is what keeps
 * phase 2 inside the budget.
 */
export async function fetchPageSample(urls: string[]): Promise<SafeResponse[]> {
  const out: SafeResponse[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < urls.length) {
      const mine = cursor++;
      try {
        out[mine] = await safeFetch(urls[mine], { timeoutMs: PAGE_TIMEOUT_MS });
      } catch {
        // A page that fails individually costs its own findings, not the check.
        out[mine] = undefined as unknown as SafeResponse;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, urls.length) }, worker));
  return out.filter((page): page is SafeResponse => page !== undefined && page.status === 200);
}
