import { describe, it, expect } from 'vitest';
import { extractLocs } from './sitemap';

/*
 * Regression tests for the CDATA bug.
 *
 * Both dominant WordPress SEO plugins wrap <loc> contents in CDATA. Failing
 * to unwrap it made sitemap discovery return nothing on most WordPress
 * sites, which reported a false "No sitemap exists" and silently dropped
 * every check that needs the page sample.
 */

describe('extractLocs', () => {
  it('unwraps CDATA, as AIOSEO and Yoast emit it', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc><![CDATA[https://www.example.com/post-sitemap.xml]]></loc>
    <lastmod><![CDATA[2026-07-31T17:19:02+00:00]]></lastmod>
  </sitemap>
  <sitemap>
    <loc><![CDATA[https://www.example.com/page-sitemap.xml]]></loc>
  </sitemap>
</sitemapindex>`;

    expect(extractLocs(xml)).toEqual([
      'https://www.example.com/post-sitemap.xml',
      'https://www.example.com/page-sitemap.xml',
    ]);
  });

  it('still reads plain, un-wrapped values', () => {
    const xml = `<urlset><url><loc>https://example.com/a</loc></url>
      <url><loc>https://example.com/b</loc></url></urlset>`;
    expect(extractLocs(xml)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('tolerates whitespace and newlines inside the tag', () => {
    const xml = '<url><loc>\n   https://example.com/spaced\n  </loc></url>';
    expect(extractLocs(xml)).toEqual(['https://example.com/spaced']);
  });

  it('decodes XML entities in query strings', () => {
    const xml = '<loc>https://example.com/?a=1&amp;b=2</loc>';
    expect(extractLocs(xml)).toEqual(['https://example.com/?a=1&b=2']);
  });

  it('handles a namespaced or attributed loc element', () => {
    const xml = '<loc xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">https://example.com/x</loc>';
    expect(extractLocs(xml)).toEqual(['https://example.com/x']);
  });

  it('skips empty values rather than emitting blanks', () => {
    expect(extractLocs('<loc></loc><loc><![CDATA[]]></loc><loc>   </loc>')).toEqual([]);
  });

  it('returns nothing for a document with no loc tags', () => {
    expect(extractLocs('<html><body>not a sitemap</body></html>')).toEqual([]);
  });
});
