import { describe, it, expect } from 'vitest';
import { fingerprintPlatform, sitemapCandidates } from './platform';
import type { SafeResponse } from './safeFetch';

function response(html: string, headers: Record<string, string> = {}): SafeResponse {
  return {
    url: 'https://example.com/',
    status: 200,
    headers: new Headers(headers),
    body: html,
    truncated: false,
    redirects: 0,
  };
}

const page = (head: string, body = '') =>
  `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

describe('fingerprintPlatform', () => {
  it('detects WordPress from asset paths', () => {
    const fp = fingerprintPlatform(response(page('', '<img src="/wp-content/uploads/a.png">')));
    expect(fp.id).toBe('wordpress');
    expect(fp.isWordPress).toBe(true);
    expect(fp.seoHome).toMatch(/Yoast|RankMath|AIOSEO/);
  });

  it('reads the WordPress version from the generator', () => {
    const fp = fingerprintPlatform(
      response(page('<meta name="generator" content="WordPress 6.4.2">'))
    );
    expect(fp.wordPressVersion).toBe('6.4.2');
  });

  it.each([
    ['shopify', page('', '<script src="https://cdn.shopify.com/s/files/x.js"></script>')],
    ['squarespace', page('', '<img src="https://static1.squarespace.com/a.png">')],
    ['wix', page('', '<script src="https://static.parastorage.com/x.js"></script>')],
    ['webflow', page('', '<div data-wf-page="abc"></div>')],
    ['drupal', page('', '<script data-drupal-settings-json="{}"></script>')],
    ['ghost', page('<meta name="generator" content="Ghost 5.0">')],
    ['gatsby', page('', '<div id="___gatsby"></div>')],
    ['nextjs', page('', '<script id="__NEXT_DATA__">{}</script>')],
  ])('detects %s', (expected, html) => {
    expect(fingerprintPlatform(response(html)).id).toBe(expected);
  });

  it('detects platforms from response headers too', () => {
    expect(fingerprintPlatform(response(page(''), { 'x-shopid': '123' })).id).toBe('shopify');
    expect(fingerprintPlatform(response(page(''), { 'x-powered-by': 'Next.js' })).id).toBe('nextjs');
  });

  it('prefers WordPress when a headless front end also looks like Next.js', () => {
    // The content still lives in WordPress, which is where a fix happens.
    const html = page('', '<div id="__NEXT_DATA__"></div><img src="/wp-content/x.png">');
    expect(fingerprintPlatform(response(html)).id).toBe('wordpress');
  });

  it('falls back to non-committal copy rather than guessing a CMS', () => {
    const fp = fingerprintPlatform(response(page('<title>Plain</title>')));
    expect(fp.id).toBe('unknown');
    expect(fp.isWordPress).toBe(false);
    // Naming the wrong platform is worse than naming none.
    expect(fp.label).toBe('this site');
    expect(fp.seoHome).not.toMatch(/Yoast|Shopify|Webflow/);
  });

  it('marks client-rendered platforms', () => {
    expect(fingerprintPlatform(response(page('', '<div id="__NEXT_DATA__"></div>'))).clientRendered).toBe(
      true
    );
    expect(fingerprintPlatform(response(page('', '<img src="/wp-content/a.png">'))).clientRendered).toBe(
      false
    );
  });
});

describe('sitemapCandidates', () => {
  it('tries WordPress paths first for WordPress', () => {
    const fp = fingerprintPlatform(response(page('', '<img src="/wp-content/a.png">')));
    expect(sitemapCandidates(fp, 'https://e.com')[0]).toBe('https://e.com/wp-sitemap.xml');
  });

  it('uses the platform convention for BigCommerce', () => {
    const fp = fingerprintPlatform(response(page(''), { 'x-bc-storefront': '1' }));
    expect(sitemapCandidates(fp, 'https://e.com')[0]).toBe('https://e.com/xmlsitemap.php');
  });

  it('still offers the generic paths for an unknown platform', () => {
    const fp = fingerprintPlatform(response(page('')));
    expect(sitemapCandidates(fp, 'https://e.com')).toContain('https://e.com/sitemap.xml');
  });
});
