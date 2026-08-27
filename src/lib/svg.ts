/*
 * Helpers for inlining Illustrator SVG into the page.
 *
 * Inlining rather than <img> is a deliberate constraint the site keeps
 * running into: CSS cannot reach inside an <img>-loaded document, so an
 * <img> can be neither recoloured from the token set nor animated on hover.
 * Every mark we ship needs at least one of those — the artwork arrives with
 * no `fill` attributes at all, which on a #0B0B0C ground means it defaults to
 * black-on-black and renders invisible.
 *
 * Inlining costs one thing, and this file exists to pay it. See below.
 */

/**
 * Namespace an Illustrator export's classes and ids so several can share a
 * page without restyling each other.
 *
 * Illustrator names every class `st0..stN` (older exports) or `cls-1..cls-N`
 * (newer ones) and reuses ids like `Layer_1-2` and `clippath` in every single
 * file. Inline two of those documents into one page and the second file's
 * `<style>` block silently restyles the first, while `url(#clippath)` in one
 * resolves against the other's `<clipPath>` — which reads as artwork randomly
 * losing its fills or getting clipped to nothing.
 *
 * References are rewritten alongside the definitions: `url(#id)` for
 * fill/clip/filter/mask, and `href="#id"` for <use>.
 *
 * Call this ONCE per document. Running it twice would re-match the class
 * names inside the prefix it just added, since `-` is a word boundary.
 */
export function namespaceSvg(svg: string, prefix: string): string {
  let out = svg.replace(/\b(st\d+|cls-\d+)\b/g, `${prefix}-$1`);

  const ids = [...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    if (id.startsWith(`${prefix}-`)) continue;
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`id="${esc}"`, 'g'), `id="${prefix}-${id}"`);
    out = out.replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${prefix}-${id})`);
    out = out.replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${prefix}-${id}"`);
  }

  return out;
}

/**
 * Drop ids that nothing in the document points at.
 *
 * Illustrator stamps `id="Layer_2"` / `id="Layer_1-2"` on the wrapper groups
 * of every export, and they are never referenced by anything. They still
 * cause a real problem: namespaceSvg prefixes per MARK, not per instance, so
 * a page rendering the same lockup twice — the navbar and the footer both do
 * — emits the same id twice. That is invalid HTML on its own, and it quietly
 * arms a much worse bug: re-export a lockup with a gradient or a clipPath in
 * it and the second instance's `url(#...)` would resolve against the first
 * instance's definition.
 *
 * Removing the dead ids rather than making the prefix unique per instance,
 * because a render counter is state that has to be threaded through every
 * component and reset per page. Nothing here needs an id it does not use.
 *
 * Anything actually referenced — the mascots' grain filter, the scene masks,
 * the sticker's textPath guides — is kept untouched.
 */
export function stripUnreferencedIds(svg: string): string {
  const referenced = new Set<string>([
    ...[...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]),
    ...[...svg.matchAll(/(?:xlink:)?href="#([^"]+)"/g)].map((m) => m[1]),
  ]);

  return svg.replace(/\sid="([^"]+)"/g, (full, id: string) =>
    referenced.has(id) ? full : ''
  );
}

/**
 * Strip the width/height/role/aria the exporter baked in and restate them.
 *
 * Illustrator writes fixed pixel dimensions that fight any CSS sizing, and
 * leaves a `<title>` that a screen reader will happily announce on artwork
 * that is pure decoration. `label` opts a mark into being announced; the
 * default is silence, which is right for everything sitting next to real text
 * that already says the same thing.
 */
export function decorateSvgRoot(svg: string, label?: string): string {
  /*
   * Drop the XML prolog. Illustrator writes `<?xml version="1.0"?>` at the top
   * of every export, which is correct for a standalone .svg file and invalid
   * once the markup is inlined into an HTML document — the HTML parser has no
   * processing instructions, so it swallows the line as a bogus comment.
   * Harmless in practice, but it is junk shipped on every page view.
   */
  const out = svg
    .replace(/^\s*<\?xml[^>]*\?>\s*/, '')
    /*
     * Strip comments. These files carry real explanation — why the sticker's
     * ring type was rebuilt, which end of a mascot's box its scene pins to —
     * and all of it is worth keeping in the source. None of it is worth
     * shipping: the markup is inlined into the HTML of every page that renders
     * the mark, so a comment block is paid for on every page view by every
     * visitor. It stays in assets-src/, it does not go over the wire.
     */
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b([^>]*)>/, (_full, attrs: string) => {
      const cleaned = attrs
        .replace(/\s(width|height)="[^"]*"/g, '')
        .replace(/\srole="[^"]*"/g, '')
        .replace(/\saria-[a-z]+="[^"]*"/g, '');
      return `<svg${cleaned} ${
        label
          ? `role="img" aria-label="${label}"`
          : 'role="presentation" aria-hidden="true" focusable="false"'
      }>`;
    });

  return label ? out : out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/, '');
}
