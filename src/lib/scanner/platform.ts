import type { SafeResponse } from './safeFetch';
import { extractMetaByName, headSection } from './html';

/*
 * Platform fingerprint (spec §3.10).
 *
 * Deliberately muted: the output of this check never becomes a Finding.
 * What it detects shapes remediation copy in other checks - "in Yoast,
 * turn on X" reads as expertise where "check your settings" reads as every
 * other free tool - and it lets the sitemap discovery order the WordPress
 * paths first when it already knows it is dealing with WordPress.
 */

export interface PlatformFingerprint {
  isWordPress: boolean;
  wordPressVersion: string | null;
  pageBuilder: 'elementor' | 'divi' | 'wpbakery' | 'gutenberg-heavy' | null;
  /** Raw generator meta content, e.g. "WordPress 6.4.2". For debugging. */
  generator: string | null;
}

export function fingerprintPlatform(response: SafeResponse): PlatformFingerprint {
  const html = response.body;
  const head = headSection(html);
  const generator = extractMetaByName(head, 'generator');

  const isWordPress =
    /wp-content\//i.test(html) ||
    /wp-includes\//i.test(html) ||
    (generator !== null && /wordpress/i.test(generator));

  const wordPressVersion =
    generator?.match(/wordpress\s+([\d.]+)/i)?.[1] ?? null;

  let pageBuilder: PlatformFingerprint['pageBuilder'] = null;
  if (/elementor-frontend|elementor-kit/i.test(html)) pageBuilder = 'elementor';
  else if (/et-builder|et_pb_/i.test(html)) pageBuilder = 'divi';
  else if (/vc_row|wpbakery|js_composer/i.test(html)) pageBuilder = 'wpbakery';
  else if (isWordPress && /<[a-z-]*wp-block-/i.test(html)) pageBuilder = 'gutenberg-heavy';

  return { isWordPress, wordPressVersion, pageBuilder, generator };
}

/** Candidate sitemap paths, ordered by what we know about the platform. */
export function sitemapCandidates(fp: PlatformFingerprint, origin: string): string[] {
  const wp = [`${origin}/wp-sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`];
  const generic = [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`];
  return fp.isWordPress ? [...wp, ...generic] : [...generic, `${origin}/sitemap_index.xml`];
}
