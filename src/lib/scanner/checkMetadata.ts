import type { SafeResponse } from './safeFetch';
import {
  collapseWhitespace,
  countH1,
  extractBackgroundImages,
  extractCanonical,
  extractH1Text,
  extractImgTags,
  extractMetaByName,
  extractMetaByProperty,
  extractTitle,
  stripTags,
} from './html';
import type { PlatformFingerprint } from './platform';
import type { SchemaCheckResult } from './checkSchema';
import type { Finding } from './types';

/*
 * Check 5 — metadata quality and uniqueness, folding in §3.8 image
 * AI-accessibility and §3.9 organisation identity consistency.
 *
 * All three parse the same already-fetched page bodies, so there is no
 * marginal network cost to any of them. The uniqueness work is what
 * generic tools do badly: exact-duplicate titles are easy, but the common
 * WordPress failure is a location-page plugin stamping near-duplicates -
 * "Services | Agency", "Services - Chicago | Agency" - which is why the
 * check normalises before it clusters.
 */

const TITLE_TOO_SHORT = 10;
const TITLE_TOO_LONG = 70;
const DESC_TOO_SHORT = 40;
const DESC_TOO_LONG = 170;

/**
 * Compare titles after stripping a shared trailing suffix. A page builder's
 * " | Site Name" suffix is the same on every page and, when titles are short,
 * dominates a character n-gram similarity score so completely that
 * "About | Co" and "Services | Co" look like the same template.
 */
const SUFFIX_PATTERN = /\s+[|\-–—·:‹›»«,·]\s+[^|\-–—·:‹›»«,·]{2,50}$/;

/** Last segment after any separator, e.g. "Wordpress" from "… | WordPress.org". */
function lastSegmentAfterSeparator(title: string): string {
  const segments = title.split(/[|\-–—·:‹›»«,·]/);
  const last = segments[segments.length - 1];
  return collapse(last ?? '');
}

function stripSuffix(title: string): string {
  return title.replace(SUFFIX_PATTERN, '').trim() || title;
}

/**
 * Jaccard-style similarity over character 3-grams, applied to the
 * suffix-stripped title. A floor on the stripped length keeps one-word
 * collisions ("Contact", "Home") from triggering a false positive.
 */
function shingles(text: string, n = 3): Set<string> {
  const padded = ` ${collapse(text)} `;
  const set = new Set<string>();
  for (let i = 0; i <= padded.length - n; i++) set.add(padded.slice(i, i + n));
  return set;
}

function collapse(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient over character 3-grams, on suffix-stripped titles. */
export function titleSimilarity(a: string, b: string): number {  if (a === b) return 1;

  const aStripped = stripSuffix(a);
  const bStripped = stripSuffix(b);

  /*
   * A shared suffix is what a template looks like, so two pages with the
   * same suffix are already worth suspecting; a page without a suffix is
   * just a short title. Only compare when both sides stripped to the same
   * (or nearly the same) remainder, or when neither had a suffix to strip -
   * which is exactly the "Home | Co" vs "Services | Co" false positive.
   */
  const aHadSuffix = aStripped !== a;
  const bHadSuffix = bStripped !== b;
  if (aHadSuffix !== bHadSuffix) return 0;
  if (aHadSuffix && bHadSuffix) {
    /*
     * Find the last separator in each title and require the brand after it
     * to match. A variable middle segment ("- Denver" vs "- Chicago") is
     * what makes it a template rather than a duplicate, so only the brand
     * needs to agree.
     */
    const aBrand = lastSegmentAfterSeparator(a);
    const bBrand = lastSegmentAfterSeparator(b);
    if (aBrand && bBrand && aBrand !== bBrand) return 0;
  }

  // A one-word remainder has no signal; "About" and "Contact" must not cluster.
  if (aStripped.split(/\s+/).length < 2 || bStripped.split(/\s+/).length < 2) return 0;

  const sa = shingles(aStripped);
  const sb = shingles(bStripped);
  if (sa.size === 0 || sb.size === 0) return 0;

  let intersection = 0;
  for (const gram of sa) if (sb.has(gram)) intersection++;
  return (2 * intersection) / (sa.size + sb.size);
}

export interface TitleCluster {
  representative: string;
  urls: string[];
  size: number;
}

/**
 * Cluster near-duplicate titles. Simple agglomerative over the sample -
 * 24 nodes, so O(n²) is irrelevant - and union on any pair scoring ≥ 0.7,
 * which is the boundary between "different pages, same template" and
 * "different pages, same site" on real WordPress titles.
 */
export function clusterTitles(pages: { url: string; title: string }[]): TitleCluster[] {
  const clusters: TitleCluster[] = [];

  for (const page of pages) {
    let placed = false;
    for (const cluster of clusters) {
      // Join if similar to the representative; clusters with a single
      // representative only merge on the title that kicked them off, which
      // is the conservative reading of the template signal.
      if (titleSimilarity(page.title, cluster.representative) >= 0.7) {
        cluster.urls.push(page.url);
        cluster.size++;
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ representative: page.title, urls: [page.url], size: 1 });
    }
  }

  return clusters.filter((c) => c.size > 1).sort((a, b) => b.size - a.size);
}

interface MetadataContext {
  schema: SchemaCheckResult;
  platform: PlatformFingerprint;
  origin: string;
}

export function checkMetadata(pages: SafeResponse[], ctx: MetadataContext): Finding[] {
  const findings: Finding[] = [];
  if (pages.length === 0) return findings;

  interface PageMeta {
    url: string;
    title: string | null;
    description: string | null;
    canonical: string | null;
    h1Count: number;
    ogPresent: boolean;
  }

  const profiles: PageMeta[] = pages.map((page) => {
    const html = page.body;
    return {
      url: page.url,
      title: extractTitle(html),
      description: extractMetaByName(html, 'description'),
      canonical: extractCanonical(html),
      h1Count: countH1(html),
      ogPresent:
        extractMetaByProperty(html, 'og:title') !== null &&
        extractMetaByProperty(html, 'og:image') !== null,
    };
  });

  const n = profiles.length;

  // --- per-field quality counts -------------------------------------------

  const missingTitle = profiles.filter((p) => !p.title);
  if (missingTitle.length >= 2) {
    findings.push({
      id: 'metadata-no-title',
      check: 'metadata',
      tag: 'gap',
      title: `${missingTitle.length} of ${n} sampled pages have no <title>`,
      detail:
        'The title is the single strongest signal an assistant has for what a page is about. ' +
        'Its absence usually means a theme template stopped outputting it.',
      evidence: { source: missingTitle[0]?.url },
      affectedUrls: missingTitle.map((p) => p.url).slice(0, 10),
      remediation: 'Check the theme header template; a missing wp_head() call is the usual cause.',
      weight: 78,
    });
  }

  const badLength = profiles.filter((p) => {
    if (!p.title) return false;
    const len = p.title.length;
    return len < TITLE_TOO_SHORT || len > TITLE_TOO_LONG;
  });
  if (badLength.length >= Math.max(2, Math.floor(n * 0.33))) {
    findings.push({
      id: 'metadata-title-length',
      check: 'metadata',
      tag: 'opportunity',
      title: `${badLength.length} of ${n} sampled titles are unusually ${badLength.every((p) => (p.title?.length ?? 0) > TITLE_TOO_LONG) ? 'long' : 'short or long'}`,
      detail:
        'Outside the roughly 30–60 character range, titles truncate in search results and ' +
        'assistants see a clipped or anemic label rather than a clear statement of what the page is.',
      evidence: { quote: badLength[0]?.title ?? undefined, source: badLength[0]?.url },
      affectedUrls: badLength.map((p) => p.url).slice(0, 10),
      remediation: 'Rewrite outliers toward 30–60 characters and make the subject of the page the subject of the title.',
      weight: 40,
    });
  }

  const missingDesc = profiles.filter((p) => !p.description);
  if (missingDesc.length >= 2) {
    findings.push({
      id: 'metadata-no-description',
      check: 'metadata',
      tag: 'gap',
      title: `${missingDesc.length} of ${n} sampled pages have no meta description`,
      detail:
        'Assistants quote descriptions when they cite a page; without one they paraphrase, ' +
        'and paraphrases drift.',
      evidence: { source: missingDesc[0]?.url },
      affectedUrls: missingDesc.map((p) => p.url).slice(0, 10),
      remediation:
        ctx.platform.isWordPress
          ? 'Write descriptions in the SEO plugin for the pages a client would actually land on first.'
          : 'Add a meta description to each key page.',
      weight: 72,
    });
  }

  const descBadLength = profiles.filter((p) => {
    if (!p.description) return false;
    const len = p.description.length;
    return len < DESC_TOO_SHORT || len > DESC_TOO_LONG;
  });
  if (descBadLength.length >= Math.max(3, Math.floor(n * 0.5))) {
    findings.push({
      id: 'metadata-description-length',
      check: 'metadata',
      tag: 'opportunity',
      title: `${descBadLength.length} of ${n} sampled descriptions are ${descBadLength.every((p) => (p.description?.length ?? 0) > DESC_TOO_LONG) ? 'too long' : 'an unusual length'}`,
      detail: 'Aim for roughly 70–160 characters: enough to quote cleanly, short enough not to truncate.',
      evidence: { quote: descBadLength[0]?.description?.slice(0, 80) ?? undefined, source: descBadLength[0]?.url },
      remediation: 'Rewrite outliers toward 70–160 characters.',
      weight: 30,
    });
  }

  // Canonical that points somewhere else is usually a migration scar.
  const canonicalMismatched = profiles.filter((p) => {
    if (!p.canonical) return false;
    try {
      return new URL(p.canonical).origin !== ctx.origin;
    } catch {
      return true;
    }
  });
  if (canonicalMismatched.length > 0) {
    findings.push({
      id: 'metadata-canonical-elsewhere',
      check: 'metadata',
      tag: 'gap',
      title: `${canonicalMismatched.length} of ${n} sampled pages canonical to a different domain`,
      detail:
        'A cross-domain canonical usually means a migration never finished - the pages are ' +
        'telling crawlers the real site lives somewhere else.',
      evidence: { quote: canonicalMismatched[0].canonical ?? undefined, source: canonicalMismatched[0].url },
      affectedUrls: canonicalMismatched.map((p) => p.url).slice(0, 10),
      remediation:
        'Fix the canonical to point at the page itself. In WordPress this is almost always ' +
        'the site-address setting or an SEO-plugin canonical override left over from staging.',
      weight: 90,
    });
  }

  const h1Wrong = profiles.filter((p) => p.h1Count !== 1);
  const h1Zero = h1Wrong.filter((p) => p.h1Count === 0);
  if (h1Zero.length >= 2) {
    findings.push({
      id: 'metadata-no-h1',
      check: 'metadata',
      tag: 'opportunity',
      title: `${h1Zero.length} of ${n} sampled pages have no H1`,
      detail: 'No H1 usually means a page builder used styled divs for the headline.',
      affectedUrls: h1Zero.map((p) => p.url).slice(0, 10),
      remediation:
        ctx.platform.pageBuilder
          ? `In ${capitalize(ctx.platform.pageBuilder)}, set the headline widget's HTML tag to H1 on each page.`
          : 'Make the page headline a real <h1>.',
      weight: 42,
    });
  }

  const ogMissing = profiles.filter((p) => !p.ogPresent);
  if (ogMissing.length >= 2) {
    findings.push({
      id: 'metadata-no-og',
      check: 'metadata',
      tag: 'opportunity',
      title: `${ogMissing.length} of ${n} sampled pages lack Open Graph previews`,
      detail: 'Sharing and assistant citation both pull from og:title and og:image.',
      affectedUrls: ogMissing.map((p) => p.url).slice(0, 10),
      remediation: 'An SEO plugin generates these automatically; turn the feature on.',
      weight: 35,
    });
  }

  // --- uniqueness clustering (§3.5) ----------------------------------------

  const titled = profiles.filter((p): p is PageMeta & { title: string } => !!p.title);
  const clusters = clusterTitles(titled.map((p) => ({ url: p.url, title: p.title })));
  if (clusters.length > 0) {
    const largest = clusters[0];
    const total = clusters.reduce((sum, c) => sum + c.size, 0);
    findings.push({
      id: 'metadata-near-duplicates',
      check: 'metadata',
      tag: 'gap',
      title: `${total} of ${titled.length} sampled pages share ${clusters.length === 1 ? 'a single' : clusters.length} title template${clusters.length === 1 ? '' : 's'}`,
      detail:
        'The common WordPress failure: a location or services plugin stamps the same title ' +
        'with a city name swapped in, so every page tells an assistant the same thing about ' +
        'what it is. Exact-duplicate scanners miss this because "Services - Denver" is not ' +
        'literally "Services - Chicago".',
      evidence: { quote: largest.representative, source: largest.urls[0] },
      affectedUrls: largest.urls.slice(0, 10),
      remediation:
        'Rewrite each cluster so the page\'s actual subject leads. A template with a swap-in ' +
        'location is fine as a starting point; it is not fine as the entire title.',
      weight: 85,
    });
  }

  // --- §3.8 image AI-accessibility -----------------------------------------

  const imgStats = pages.map((page) => {
    const imgs = extractImgTags(page.body).filter((img) => {
      const src = img.src ?? '';
      // Tracking pixels and inline SVGs are not content images.
      return src !== '' && !src.startsWith('data:') && !/pixel|beacon|spacer/i.test(src);
    });
    const missingAlt = imgs.filter((img) => !img.alt || img.alt.trim() === '');
    const bgImages = extractBackgroundImages(page.body).filter((u) => !u.startsWith('data:'));
    return { url: page.url, total: imgs.length, missingAlt: missingAlt.length, bgImages: bgImages.length };
  });

  const totalImgs = imgStats.reduce((s, p) => s + p.total, 0);
  const totalMissingAlt = imgStats.reduce((s, p) => s + p.missingAlt, 0);
  const totalBg = imgStats.reduce((s, p) => s + p.bgImages, 0);

  if (totalImgs >= 5 && totalMissingAlt / totalImgs >= 0.4 && totalMissingAlt >= 4) {
    findings.push({
      id: 'images-missing-alt',
      check: 'metadata',
      tag: 'gap',
      title: `${totalMissingAlt} of ${totalImgs} sampled images have no alt text`,
      detail:
        'A multimodal assistant cannot see what those images show, so your portfolio, team ' +
        'and product photography is invisible unless someone has already written it up in prose.',
      evidence: { source: imgStats.find((p) => p.missingAlt > 0)?.url },
      affectedUrls: imgStats.filter((p) => p.missingAlt > 0).map((p) => p.url).slice(0, 10),
      remediation:
        'Add descriptive alt text in the media library. The accessibility win is free on top.',
      weight: 55,
    });
  }

  if (totalBg >= 3) {
    findings.push({
      id: 'images-css-backgrounds',
      check: 'metadata',
      tag: 'opportunity',
      title: `${totalBg} images on the sampled pages are delivered as CSS backgrounds`,
      detail:
        'Hero and portfolio images delivered as background-image are invisible to a text-first ' +
        'crawler and to any assistant that cannot execute stylesheets.',
      affectedUrls: imgStats.filter((p) => p.bgImages > 0).map((p) => p.url).slice(0, 10),
      remediation:
        'Move key business imagery into real <img> tags with alt text. Backgrounds are for decoration.',
      weight: 48,
    });
  }

  // --- §3.9 organisation identity consistency (homepage only) --------------

  const homepage = profiles.find((p) => p.url === `${ctx.origin}/`) ?? profiles[0];
  if (homepage) {
    const schemaOrgName = ctx.schema.orgName;
    const h1Text = homepage.title ? extractH1Text(pages.find((p) => p.url === homepage.url)?.body ?? '') : null;

    if (!schemaOrgName) {
      findings.push({
        id: 'identity-no-org',
        check: 'metadata',
        tag: 'opportunity',
        title: 'Nothing tells an assistant which business this site belongs to',
        detail:
          'There is no Organization or LocalBusiness schema on the sampled pages, so an assistant ' +
          'has to infer the business name from the title and h1 - and it might pick a page ' +
          'headline instead of a brand.',
        evidence: { source: homepage.url },
        remediation:
          'Add LocalBusiness or Organization schema with the business name. Yoast and RankMath ' +
          'both have a knowledge-graph tab that generates it from fields you have probably ' +
          'already filled in.',
        weight: 62,
      });
    } else {
      const schemaName = collapseWhitespace(schemaOrgName).toLowerCase();
      const titleText = homepage.title ? collapseWhitespace(stripTags(homepage.title)).toLowerCase() : '';
      const h1 = h1Text ? collapseWhitespace(h1Text).toLowerCase() : '';

      // A name mismatch is worth reporting only if neither visible field contains the schema's name.
      const matchesVisible =
        (titleText !== '' && titleText.includes(schemaName)) ||
        (h1 !== '' && h1.includes(schemaName));

      if (!matchesVisible) {
        findings.push({
          id: 'identity-mismatch',
          check: 'metadata',
          tag: 'gap',
          title: 'The business name claimed by schema does not match the visible site',
          detail:
            `Schema says "${schemaOrgName}" but neither the homepage title nor its H1 contains ` +
            'that name. An assistant grounding a "who are these people" answer will pick whichever ' +
            'string it found last.',
          evidence: { quote: `Organization schema name: "${schemaOrgName}"`, source: homepage.url },
          remediation:
            'Decide which is right and fix the other. A theme demo leftover in the schema is ' +
            'the usual cause.',
          weight: 66,
        });
      }
    }
  }

  return findings;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
