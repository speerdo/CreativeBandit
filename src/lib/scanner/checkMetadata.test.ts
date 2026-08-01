import { describe, it, expect } from 'vitest';
import { clusterTitles, titleSimilarity } from './checkMetadata';
import { checkSchema, orgNamesFromPage } from './checkSchema';
import type { SafeResponse } from './safeFetch';

function page(url: string, body: string): SafeResponse {
  return {
    url,
    status: 200,
    headers: new Headers(),
    body,
    truncated: false,
    redirects: 0,
  };
}

const HOME_URL = 'https://example.com/';

describe('titleSimilarity', () => {
  it('scores a genuine location-page template as similar', () => {
    expect(
      titleSimilarity(
        'Web Design Services - Denver | Acme Agency',
        'Web Design Services - Chicago | Acme Agency'
      )
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('rejects short titles with a shared suffix - the wordpress.org case', () => {
    expect(titleSimilarity('About – WordPress.org', 'Counter – WordPress.org')).toBe(0);
    expect(titleSimilarity('About | My Site', 'Services | My Site')).toBe(0);
  });

  it('rejects titles whose suffix brands differ', () => {
    expect(
      titleSimilarity('About | Acme Agency', 'About | Other Company Ltd')
    ).toBe(0);
  });

  it('accepts identical titles trivially', () => {
    expect(titleSimilarity('Hello World', 'Hello World')).toBe(1);
  });

  it('scores unrelated titles as dissimilar', () => {
    expect(
      titleSimilarity('Services | Acme Agency', 'Contact Us For A Free Quote Today')
    ).toBeLessThan(0.4);
  });
});

describe('clusterTitles', () => {
  it('clusters a genuine repeated-template pair', () => {
    const pages = [
      { url: 'a', title: 'Web Design Services - Denver | Acme Agency' },
      { url: 'b', title: 'Web Design Services - Chicago | Acme Agency' },
      { url: 'c', title: 'Web Design Services - Austin | Acme Agency' },
      { url: 'd', title: 'About Our Small Agency Team' },
    ];
    const clusters = clusterTitles(pages);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].size).toBe(3);
  });

  it('does not cluster wordpress.org-style distinct pages', () => {
    const pages = [
      { url: 'a', title: 'About – WordPress.org' },
      { url: 'b', title: 'Counter – WordPress.org' },
      { url: 'c', title: 'Enterprise – WordPress.org' },
      { url: 'd', title: 'Media | WordPress.org' },
    ];
    expect(clusterTitles(pages)).toHaveLength(0);
  });

  it('ignores singletons', () => {
    const clusters = clusterTitles([
      { url: 'a', title: 'Home | Site' },
      { url: 'b', title: 'About | Site' },
    ]);
    expect(clusters).toHaveLength(0);
  });
});

const WP_BOILERPLATE = `<script type="application/ld+json">{
  "@context":"https://schema.org",
  "@graph":[
    {"@type":"WebSite","name":"Example"},
    {"@type":"WebPage"},
    {"@type":"BreadcrumbList"}
  ]
}</script>`;

const PRODUCT_INCOMPLETE = `<script type="application/ld+json">{
  "@context":"https://schema.org",
  "@type":"Product"
}</script>`;

const ORG = `<script type="application/ld+json">{
  "@context":"https://schema.org",
  "@type":"Organization",
  "name":"Acme Agency"
}</script>`;

describe('checkSchema', () => {
  const sitemap = { urls: [HOME_URL], source: 'sitemap' as const, sitemapMissing: false };
  const platform = {
    isWordPress: true,
    wordPressVersion: '6.4.2',
    pageBuilder: null,
    generator: 'WordPress 6.4.2',
  };
  const origin = 'https://example.com';

  it('reports boilerplate-only coverage as an opportunity, not a gap', () => {
    const pages = [
      page(HOME_URL, `<html><head>${WP_BOILERPLATE}</head><body>x</body></html>`),
      page('https://example.com/about/', `<html><head>${WP_BOILERPLATE}</head><body>y</body></html>`),
    ];
    const result = checkSchema(pages, sitemap, platform, origin);
    const finding = result.findings.find((f) => f.id === 'schema-no-entity');
    expect(finding).toBeDefined();
    expect(finding?.tag).toBe('opportunity');
  });

  it('reports zero schema at all as a gap', () => {
    const pages = [page(HOME_URL, '<html><body>nothing</body></html>')];
    const result = checkSchema(pages, sitemap, platform, origin);
    const finding = result.findings.find((f) => f.id === 'schema-no-entity');
    expect(finding?.tag).toBe('gap');
  });

  it('flags malformed JSON-LD instead of crashing', () => {
    const broken = '<script type="application/ld+json">{not json}</script>';
    const pages = [page(HOME_URL, `<html><head>${broken}</head><body>x</body></html>`)];
    const result = checkSchema(pages, sitemap, platform, origin);
    const finding = result.findings.find((f) => f.id === 'schema-broken-json-ld');
    expect(finding).toBeDefined();
    expect(finding?.tag).toBe('gap');
  });

  it('flags a Product with nothing in it', () => {
    const pages = [page(HOME_URL, `<html><head>${PRODUCT_INCOMPLETE}</head><body>x</body></html>`)];
    const result = checkSchema(pages, sitemap, platform, origin);
    const finding = result.findings.find((f) => f.id === 'schema-incomplete-entity');
    expect(finding).toBeDefined();
  });

  it('reads the Organisation name for the identity check', () => {
    const result = checkSchema(
      [page(HOME_URL, `<html><head>${ORG}</head><body>x</body></html>`)],
      sitemap,
      platform,
      origin
    );
    expect(result.orgName).toBe('Acme Agency');
  });
});

describe('orgNamesFromPage', () => {
  it('finds an Organization name inside @graph', () => {
    const html = `<script type="application/ld+json">{
      "@context":"https://schema.org",
      "@graph":[{"@type":"Organization","name":"Nested Org","url":"https://example.com"}]
    }</script>`;
    expect(orgNamesFromPage(html)).toContain('Nested Org');
  });

  it('does not invent names from random nodes', () => {
    const html = `<script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"Article","headline":"A Blog Post"
    }</script>`;
    expect(orgNamesFromPage(html)).toHaveLength(0);
  });
});
