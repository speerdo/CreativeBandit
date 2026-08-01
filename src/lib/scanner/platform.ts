import type { SafeResponse } from './safeFetch';
import { extractMetaByName, headSection } from './html';

/*
 * Platform fingerprint (spec §3.10).
 *
 * Deliberately muted: the output never becomes a Finding of its own. What it
 * detects shapes remediation copy elsewhere - "in Yoast, turn on X" reads as
 * expertise where "check your settings" reads as every other free tool - and
 * it lets sitemap discovery try the right paths first.
 *
 * Extended beyond WordPress because the scan is useful on any site, and a
 * Shopify or Webflow client got the generic fallback copy that this check
 * exists specifically to avoid. Detection order matters: several of these
 * ship a `generator` tag AND recognisable asset paths, and a few hosted
 * builders proxy through WordPress-looking URLs.
 */

export type PlatformId =
  | 'wordpress'
  | 'shopify'
  | 'squarespace'
  | 'wix'
  | 'webflow'
  | 'drupal'
  | 'joomla'
  | 'ghost'
  | 'hubspot'
  | 'bigcommerce'
  | 'duda'
  | 'nextjs'
  | 'astro'
  | 'gatsby'
  | 'unknown';

export interface PlatformFingerprint {
  id: PlatformId;
  /** Human name, safe to drop straight into remediation copy. */
  label: string;
  /** Kept as its own flag: several checks branch on it specifically. */
  isWordPress: boolean;
  wordPressVersion: string | null;
  pageBuilder: 'elementor' | 'divi' | 'wpbakery' | 'gutenberg-heavy' | null;
  /** Raw generator meta content, e.g. "WordPress 6.4.2". For debugging. */
  generator: string | null;
  /**
   * Where the person fixing this actually goes. Phrased to slot into
   * "<seoHome> is where the title and description live."
   */
  seoHome: string;
  /**
   * True when the platform renders primarily client-side, so a thin initial
   * HTML payload is expected rather than alarming. Informational until the
   * §3.3 JS-content check lands in phase 3.
   */
  clientRendered: boolean;
}

interface Signature {
  id: PlatformId;
  label: string;
  seoHome: string;
  clientRendered?: boolean;
  /** Any match identifies the platform. */
  test: (html: string, generator: string | null, headers: Headers) => boolean;
}

const has = (html: string, pattern: RegExp) => pattern.test(html);

/*
 * Ordered most-specific first. Hosted platforms are checked before the
 * JS frameworks, because a Next.js storefront on Shopify should read as
 * Shopify - that is where its owner goes to change anything.
 */
const SIGNATURES: Signature[] = [
  {
    id: 'shopify',
    label: 'Shopify',
    seoHome: 'the theme editor, or an SEO app such as Yoast for Shopify',
    test: (html, gen, headers) =>
      has(html, /cdn\.shopify\.com|shopify-section|Shopify\.theme/i) ||
      /shopify/i.test(gen ?? '') ||
      headers.get('x-shopid') !== null,
  },
  {
    id: 'squarespace',
    label: 'Squarespace',
    seoHome: 'Pages → SEO in the site editor',
    test: (html, gen, headers) =>
      has(html, /squarespace\.com|static1\.squarespace|Static\.SQUARESPACE_CONTEXT/i) ||
      /squarespace/i.test(gen ?? '') ||
      (headers.get('server') ?? '').toLowerCase().includes('squarespace'),
  },
  {
    id: 'wix',
    label: 'Wix',
    seoHome: 'the SEO panel on each page in the Wix editor',
    clientRendered: true,
    test: (html, gen, headers) =>
      has(html, /static\.parastorage\.com|wix-warmup-data|wixstatic\.com/i) ||
      /wix\.com/i.test(gen ?? '') ||
      headers.get('x-wix-request-id') !== null,
  },
  {
    id: 'webflow',
    label: 'Webflow',
    seoHome: 'Page Settings → SEO in the Designer',
    test: (html, gen) =>
      has(html, /assets-global\.website-files\.com|assets\.website-files\.com|data-wf-page/i) ||
      /webflow/i.test(gen ?? ''),
  },
  {
    id: 'bigcommerce',
    label: 'BigCommerce',
    seoHome: 'Storefront → SEO settings',
    test: (html, _gen, headers) =>
      has(html, /cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-/i) ||
      headers.get('x-bc-storefront') !== null,
  },
  {
    id: 'hubspot',
    label: 'HubSpot CMS',
    seoHome: 'the page editor’s Settings tab',
    test: (html, gen) => has(html, /hs-scripts\.com|hubspot\.net\/hub|hs-sites\.com/i) || /hubspot/i.test(gen ?? ''),
  },
  {
    id: 'duda',
    label: 'Duda',
    seoHome: 'Site → SEO in the editor',
    test: (html, gen) => has(html, /irp\.cdn-website\.com|dudamobile|duda_website/i) || /duda/i.test(gen ?? ''),
  },
  {
    id: 'ghost',
    label: 'Ghost',
    seoHome: 'the post/page settings panel, or code injection for site-wide tags',
    test: (html, gen) => /ghost/i.test(gen ?? '') || has(html, /content\/images\/size\/w\d+\/|ghost-sdk/i),
  },
  {
    id: 'drupal',
    label: 'Drupal',
    seoHome: 'the Metatag module',
    test: (html, gen, headers) =>
      /drupal/i.test(gen ?? '') ||
      has(html, /sites\/default\/files|drupal-settings-json/i) ||
      headers.get('x-drupal-cache') !== null ||
      headers.get('x-generator')?.toLowerCase().includes('drupal') === true,
  },
  {
    id: 'joomla',
    label: 'Joomla',
    seoHome: 'Global Configuration → Site Metadata',
    test: (html, gen) => /joomla/i.test(gen ?? '') || has(html, /\/media\/jui\/|option=com_/i),
  },
  {
    id: 'gatsby',
    label: 'Gatsby',
    seoHome: 'whatever head component the site uses (react-helmet or Gatsby Head API)',
    test: (html, gen) => /gatsby/i.test(gen ?? '') || has(html, /___gatsby|gatsby-chunk-mapping/i),
  },
  {
    id: 'astro',
    label: 'Astro',
    seoHome: 'the layout component that renders <head>',
    test: (html, gen) => /astro/i.test(gen ?? '') || has(html, /astro-island|data-astro-/i),
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    seoHome: 'the metadata export or <Head> in each route',
    clientRendered: true,
    test: (html, _gen, headers) =>
      has(html, /__NEXT_DATA__|\/_next\/static/i) || headers.get('x-powered-by') === 'Next.js',
  },
];

export function fingerprintPlatform(response: SafeResponse): PlatformFingerprint {
  const html = response.body;
  const head = headSection(html);
  const generator = extractMetaByName(head, 'generator');
  const headers = response.headers;

  const isWordPress =
    /wp-content\//i.test(html) ||
    /wp-includes\//i.test(html) ||
    (generator !== null && /wordpress/i.test(generator));

  const wordPressVersion = generator?.match(/wordpress\s+([\d.]+)/i)?.[1] ?? null;

  let pageBuilder: PlatformFingerprint['pageBuilder'] = null;
  if (/elementor-frontend|elementor-kit/i.test(html)) pageBuilder = 'elementor';
  else if (/et-builder|et_pb_/i.test(html)) pageBuilder = 'divi';
  else if (/vc_row|wpbakery|js_composer/i.test(html)) pageBuilder = 'wpbakery';
  else if (isWordPress && /<[a-z-]*wp-block-/i.test(html)) pageBuilder = 'gutenberg-heavy';

  // WordPress wins outright when its own markers are present: a headless WP
  // front end may also look like Next.js, but the content still lives in WP.
  if (isWordPress) {
    return {
      id: 'wordpress',
      label: 'WordPress',
      isWordPress: true,
      wordPressVersion,
      pageBuilder,
      generator,
      seoHome: 'your SEO plugin (Yoast, RankMath or AIOSEO)',
      clientRendered: false,
    };
  }

  for (const signature of SIGNATURES) {
    if (!signature.test(html, generator, headers)) continue;
    return {
      id: signature.id,
      label: signature.label,
      isWordPress: false,
      wordPressVersion: null,
      pageBuilder: null,
      generator,
      seoHome: signature.seoHome,
      clientRendered: signature.clientRendered ?? false,
    };
  }

  return {
    id: 'unknown',
    label: 'this site',
    isWordPress: false,
    wordPressVersion: null,
    pageBuilder: null,
    generator,
    // Deliberately non-committal rather than wrong. Naming the wrong CMS is
    // worse than naming none.
    seoHome: 'wherever page titles and descriptions are set on this platform',
    clientRendered: false,
  };
}

/** Candidate sitemap paths, ordered by what we know about the platform. */
export function sitemapCandidates(fp: PlatformFingerprint, origin: string): string[] {
  const generic = [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`, `${origin}/sitemap_index.xml`];

  if (fp.isWordPress) {
    return [`${origin}/wp-sitemap.xml`, `${origin}/sitemap_index.xml`, ...generic];
  }

  // Platform-specific conventions worth trying before the generic list.
  const known: Partial<Record<PlatformId, string[]>> = {
    shopify: [`${origin}/sitemap.xml`],
    squarespace: [`${origin}/sitemap.xml`],
    wix: [`${origin}/sitemap.xml`, `${origin}/pages-sitemap.xml`],
    webflow: [`${origin}/sitemap.xml`],
    drupal: [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`],
    ghost: [`${origin}/sitemap.xml`, `${origin}/sitemap-pages.xml`],
    bigcommerce: [`${origin}/xmlsitemap.php`, `${origin}/sitemap.xml`],
  };

  return [...(known[fp.id] ?? []), ...generic];
}
