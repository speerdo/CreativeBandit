/*
 * Shared HTML helpers for checks that parse already-fetched page bodies.
 *
 * Every parser here works on HTML the page fetcher has already retrieved,
 * so none of them should ever trigger another network request. Keep them
 * fast, forgiving of malformed markup, and free of any dependency heavier
 * than a regex: the bodies arrive truncated at the safeFetch byte cap and
 * are sometimes cut mid-tag, so strict parsing buys nothing.
 */

/** Extract the contents of the first <title> tag, if present. */
export function extractTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

/** Extract a <meta> tag's content value by name. */
export function extractMetaByName(html: string, name: string): string | null {
  return extractMeta(html, 'name', name);
}

/** Extract a <meta> tag's content value by property, e.g. og:title. */
export function extractMetaByProperty(html: string, property: string): string | null {
  return extractMeta(html, 'property', property);
}

function extractMeta(html: string, attr: 'name' | 'property', key: string): string | null {
  // Search only the head when it exists; meta tags elsewhere are not metadata.
  const head = headSection(html);
  const pattern = new RegExp(
    `<meta\\b[^>]*\\b${attr}\\s*=\\s*["']${escapeRegex(key)}["'][^>]*>`,
    'gi'
  );
  const tag = pattern.exec(head)?.[0];
  if (!tag) return null;
  const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
  return content != null ? decodeEntities(content.trim()) : null;
}

/** Extract <link rel="canonical" href="...">. */
export function extractCanonical(html: string): string | null {
  const head = headSection(html);
  const links = head.match(/<link\b[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'][^>]*>/gi) ?? [];
  for (const tag of links) {
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return decodeEntities(href.trim());
  }
  return null;
}

/** Count <h1> tags in the body. */
export function countH1(html: string): number {
  return (html.match(/<h1\b/gi) ?? []).length;
}

/** Extract the text of the first <h1>, for §3.9. */
export function extractH1Text(html: string): string | null {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return null;
  return decodeEntities(stripTags(match[1]).trim());
}

/** The <head> section, or a sensible slice of the document if there is none. */
export function headSection(html: string): string {
  const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : html.slice(0, 60_000);
}

/** Every <link> tag in the head. */
export function extractLinkTags(html: string): string[] {
  return headSection(html).match(/<link\b[^>]*>/gi) ?? [];
}

/** Every <img> tag in the document. */
export function extractImgTags(html: string): { src: string | null; alt: string | null }[] {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  return tags.map((tag) => ({
    src: tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? null,
    alt: tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? null,
  }));
}

/**
 * Inline CSS background images referenced by style attributes. These are
 * the delivery mechanism for a lot of WordPress page-builder hero and
 * portfolio sections, and they are invisible to a crawler.
 */
export function extractBackgroundImages(html: string): string[] {
  const styles = html.match(/\bstyle\s*=\s*["'][^"']*background(-image)?[^"']*["']/gi) ?? [];
  const urls: string[] = [];
  for (const style of styles) {
    const match = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    if (match) urls.push(match[1]);
  }
  return urls;
}

/** Strip HTML tags from a fragment. */
export function stripTags(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, ' ');
}

/** Normalise whitespace for comparison. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A small, deliberate subset of entities; we are reporting, not rendering. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
