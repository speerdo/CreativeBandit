import { renderPages, RenderUnavailableError } from './render';
import type { SafeResponse } from './safeFetch';
import type { Finding } from './types';
import type { PlatformFingerprint } from './platform';

/*
 * Check 3 — content readable without JavaScript. Spec §3.3.
 *
 * Most AI crawlers do not execute JavaScript. If the content only exists
 * after hydration, assistants cannot see it, however good the schema is.
 *
 * This is the most expensive check in the product (a real browser, ~1.7s
 * per page measured), so it runs last, on a small sample, and only with
 * budget left. Spec §5 names it as the first thing to degrade.
 */

/** Measured at ~1.7s/page, so three is about five seconds of budget. */
export const MAX_RENDERED_PAGES = 3;

/*
 * Thresholds from spec §3.3. Deliberately generous at the top: a standard
 * WordPress theme passes easily and should produce a `good` finding rather
 * than a manufactured fault.
 */
const RATIO_FINE = 0.9;
const RATIO_PARTIAL = 0.5;

/**
 * Visible text, with everything that is not prose removed first.
 *
 * The naive version of this - strip <script> and <style>, then remove tags -
 * measured linear.app's homepage at 834KB of "text". It ships 179 inline
 * SVGs and a 261KB stylesheet, and the leftover markup swamped the actual
 * copy. Anything that is not read as content has to go before measuring, or
 * the ratio is noise.
 */
export function extractText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * An empty framework mount point with no content around it. The strongest
 * version of this finding, and detectable without rendering anything.
 */
export function looksLikeAppShell(html: string): boolean {
  const text = extractText(html);
  if (text.length > 600) return false;

  return /<div[^>]+id=["'](root|app|__next|___gatsby|__nuxt)["'][^>]*>\s*<\/div>/i.test(html);
}

export interface JsContentContext {
  platform: PlatformFingerprint;
  deadline: number;
}

export async function checkJsContent(
  pages: SafeResponse[],
  ctx: JsContentContext
): Promise<Finding[]> {
  if (pages.length === 0) return [];

  // Prefer the homepage plus the two deepest-content pages we already have.
  const candidates = pages.slice(0, MAX_RENDERED_PAGES);
  const rawByUrl = new Map(candidates.map((p) => [p.url, p.body]));

  let rendered;
  try {
    rendered = await renderPages(
      candidates.map((p) => p.url),
      { deadline: ctx.deadline }
    );
  } catch (error) {
    if (error instanceof RenderUnavailableError) return [];
    throw error;
  }

  if (rendered.length === 0) return [];

  const comparisons = rendered
    .map((page) => {
      const raw = rawByUrl.get(page.url);
      if (raw === undefined) return null;
      const rawLen = extractText(raw).length;
      const renderedLen = extractText(page.html).length;
      if (renderedLen < 200) return null; // too little to reason about
      return { url: page.url, rawLen, renderedLen, ratio: rawLen / renderedLen };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (comparisons.length === 0) return [];

  const worst = comparisons.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  const shell = candidates.some((p) => looksLikeAppShell(p.body));

  const pct = (ratio: number) => `${Math.round(Math.min(ratio, 1) * 100)}%`;

  if (shell || worst.ratio < RATIO_PARTIAL) {
    return [
      {
        id: 'js-content-hidden',
        check: 'js-content',
        tag: 'gap',
        title: shell
          ? 'The page is an empty shell until JavaScript runs'
          : `Only ${pct(worst.ratio)} of the page content exists before JavaScript runs`,
        detail:
          'Most AI crawlers do not execute JavaScript. Whatever is not in the HTML that comes ' +
          'back from the server is invisible to them, no matter how good the rest of the ' +
          'markup is.',
        evidence: {
          quote: `${worst.rawLen} characters served, ${worst.renderedLen} after rendering`,
          source: worst.url,
        },
        affectedUrls: comparisons.filter((c) => c.ratio < RATIO_PARTIAL).map((c) => c.url),
        remediation: ctx.platform.clientRendered
          ? `${ctx.platform.label} renders in the browser by default. Server-side rendering or ` +
            'prerendering for the pages that matter commercially is the fix.'
          : 'Render the key content server-side, or prerender those pages at build time.',
        weight: 92,
      },
    ];
  }

  if (worst.ratio < RATIO_FINE) {
    return [
      {
        id: 'js-content-partial',
        check: 'js-content',
        tag: 'opportunity',
        title: `About ${pct(1 - worst.ratio)} of the content on some pages needs JavaScript`,
        detail:
          'The page is mostly readable without JavaScript, but a meaningful slice is not. It is ' +
          'usually tabs, accordions, reviews, or product data injected after load. Assistants ' +
          'see the page without that part.',
        evidence: {
          quote: `${worst.rawLen} characters served, ${worst.renderedLen} after rendering`,
          source: worst.url,
        },
        remediation:
          'Check what is being injected client-side on those pages. Anything a client would ' +
          'want quoted should be in the served HTML.',
        weight: 50,
      },
    ];
  }

  return [
    {
      id: 'js-content-fine',
      check: 'js-content',
      tag: 'good',
      title: 'Content is readable without JavaScript',
      detail:
        'The HTML the server returns already contains the page copy, so crawlers that do not ' +
        'run JavaScript still see it. This is the common case on WordPress and worth confirming.',
      evidence: { source: worst.url },
      remediation: 'No action needed.',
      weight: 36,
    },
  ];
}
