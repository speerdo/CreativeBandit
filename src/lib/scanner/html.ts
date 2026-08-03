/*
 * Shared HTML helpers for checks that parse already-fetched page bodies.
 *
 * Every parser here works on HTML the page fetcher has already retrieved,
 * so none of them should ever trigger another network request. Keep them
 * fast, forgiving of malformed markup, and free of any dependency heavier
 * than a regex: the bodies arrive truncated at the safeFetch byte cap and
 * are sometimes cut mid-tag, so strict parsing buys nothing.
 */

/**
 * Read one attribute off a single tag.
 *
 * The quote character is captured and back-referenced rather than excluded
 * by a character class. `content="[^"']*"` looks equivalent and is not: it
 * stops at the first apostrophe inside a double-quoted value, so
 * `content="what we'll do for you"` measured four characters instead of
 * twenty-one. English marketing copy is full of apostrophes, and the
 * downstream effect was a description reported as too short when it was
 * fine. Unquoted values are accepted last, since malformed markup is the
 * normal case here.
 */
export function attr(tag: string, name: string): string | null {
  const quoted = new RegExp(`\\b${escapeRegex(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const match = tag.match(quoted);
  if (match) return match[2];
  const bare = new RegExp(`\\b${escapeRegex(name)}\\s*=\\s*([^\\s"'>]+)`, 'i');
  return tag.match(bare)?.[1] ?? null;
}

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

function extractMeta(html: string, keyAttr: 'name' | 'property', key: string): string | null {
  // Search only the head when it exists; meta tags elsewhere are not metadata.
  const head = headSection(html);
  const pattern = new RegExp(
    `<meta\\b[^>]*\\b${keyAttr}\\s*=\\s*["']${escapeRegex(key)}["'][^>]*>`,
    'gi'
  );
  const tag = pattern.exec(head)?.[0];
  if (!tag) return null;
  const content = attr(tag, 'content');
  return content != null ? decodeEntities(content.trim()) : null;
}

/** Extract <link rel="canonical" href="...">. */
export function extractCanonical(html: string): string | null {
  const head = headSection(html);
  const links = head.match(/<link\b[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'][^>]*>/gi) ?? [];
  for (const tag of links) {
    const href = attr(tag, 'href');
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

/**
 * Every <img> tag in the document.
 *
 * `alt` and `decorative` are separate answers to separate questions, and
 * conflating them is a real false positive: `alt=""` is the correct ARIA
 * treatment for an image that carries no information (a logo mark sitting
 * next to the wordmark it duplicates, a spacer, an icon beside its own
 * label). An author who writes it has done the right thing. An <img> with no
 * `alt` attribute at all is the actual defect — a screen reader falls back to
 * announcing the filename, and a multimodal crawler has nothing to read.
 */
export function extractImgTags(
  html: string
): { src: string | null; alt: string | null; decorative: boolean }[] {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  return tags.map((tag) => {
    const alt = attr(tag, 'alt');
    return {
      src: attr(tag, 'src'),
      alt,
      // Explicitly declared decorative, by any of the three conventions.
      decorative:
        (alt !== null && alt.trim() === '') ||
        /^(presentation|none)$/i.test(attr(tag, 'role') ?? '') ||
        (attr(tag, 'aria-hidden') ?? '').toLowerCase() === 'true',
    };
  });
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
