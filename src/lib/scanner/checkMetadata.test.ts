import { describe, it, expect } from 'vitest';
import { checkMetadata, clusterTitles, titleSimilarity } from './checkMetadata';
import { checkSchema, orgNamesFromPage } from './checkSchema';
import { attr, extractImgTags, extractMetaByName } from './html';
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

describe('image alt handling', () => {
  const emptyPlatform = {
    id: 'unknown',
    label: 'this platform',
    isWordPress: false,
    clientRendered: false,
    pageBuilder: null,
    seoHome: 'your SEO settings',
  } as const;

  /** Ten pages, each carrying the same set of images. */
  function pagesWith(imgs: string): SafeResponse[] {
    return Array.from({ length: 10 }, (_, i) =>
      page(
        `https://example.com/p${i}/`,
        `<html><head><title>Page ${i} About Something</title>
         <meta name="description" content="${'A description long enough to clear the minimum. '.repeat(2)}">
         <meta property="og:title" content="Page ${i}"><meta property="og:image" content="/og.png">
         <link rel="canonical" href="https://example.com/p${i}/"></head>
         <body><h1>Page ${i}</h1>${imgs}</body></html>`
      )
    );
  }

  const noSchema = { findings: [], orgName: 'Example', orgUrls: [] };
  const ctx = { schema: noSchema, platform: emptyPlatform as never, origin: 'https://example.com' };

  it('does not flag images explicitly marked decorative', () => {
    // alt="" is the correct treatment for a logo that repeats the wordmark
    // beside it. It is not a missing alt attribute.
    const findings = checkMetadata(pagesWith('<img src="/logo.svg" alt="">'.repeat(6)), ctx);
    expect(findings.find((f) => f.id === 'images-missing-alt')).toBeUndefined();
  });

  it('flags images with no alt attribute at all', () => {
    const findings = checkMetadata(pagesWith('<img src="/photo.jpg">'.repeat(6)), ctx);
    expect(findings.find((f) => f.id === 'images-missing-alt')).toBeDefined();
  });

  it('ignores role="presentation" and aria-hidden images', () => {
    const findings = checkMetadata(
      pagesWith('<img src="/deco.svg" role="presentation">'.repeat(6)),
      ctx
    );
    expect(findings.find((f) => f.id === 'images-missing-alt')).toBeUndefined();
  });

  it('still counts a real gap when decorative images share the page', () => {
    const findings = checkMetadata(
      pagesWith('<img src="/logo.svg" alt="">'.repeat(4) + '<img src="/photo.jpg">'.repeat(5)),
      ctx
    );
    const finding = findings.find((f) => f.id === 'images-missing-alt');
    // Decorative images leave the denominator too: 50 real images, all bare.
    expect(finding?.title).toBe('50 of 50 sampled images have no alt text');
  });
});

describe('attribute parsing', () => {
  it('does not truncate a double-quoted value at an apostrophe', () => {
    // The bug this replaced measured 24 characters instead of 60, which
    // reported a perfectly good description as too short.
    const html =
      `<html><head><meta name="description" content="We'll tell you what your client's site can't do today."></head></html>`;
    expect(extractMetaByName(html, 'description')).toBe(
      "We'll tell you what your client's site can't do today."
    );
  });

  it('reads single-quoted values containing double quotes', () => {
    const html = `<html><head><meta name='description' content='He said "hello" once.'></head></html>`;
    expect(extractMetaByName(html, 'description')).toBe('He said "hello" once.');
  });

  it('reads an unquoted attribute value', () => {
    expect(attr('<img src=/logo.svg alt=Logo>', 'src')).toBe('/logo.svg');
  });

  it('keeps alt text containing an apostrophe intact', () => {
    const [img] = extractImgTags(`<img src="/a.jpg" alt="Adam's desk">`);
    expect(img.alt).toBe("Adam's desk");
    expect(img.decorative).toBe(false);
  });
});
