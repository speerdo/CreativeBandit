import { describe, it, expect } from 'vitest';
import { collectDirectives, blockingDirectives } from './directives';

const headers = (init: Record<string, string> = {}) => new Headers(init);

const page = (head: string) => `<!DOCTYPE html><html><head>${head}</head><body>x</body></html>`;

describe('collectDirectives — headers', () => {
  it('reads a single X-Robots-Tag', () => {
    const d = collectDirectives(headers({ 'X-Robots-Tag': 'noindex' }), page(''));
    expect(d.found.has('noindex')).toBe(true);
  });

  it('splits a comma-joined value', () => {
    const d = collectDirectives(
      headers({ 'X-Robots-Tag': 'noindex, nofollow, nosnippet' }),
      page('')
    );
    expect([...d.found.keys()]).toEqual(
      expect.arrayContaining(['noindex', 'nofollow', 'nosnippet'])
    );
  });

  it('treats a leading token as an agent scope', () => {
    const d = collectDirectives(headers({ 'X-Robots-Tag': 'googlebot: noindex' }), page(''));
    expect(d.scoped).toContainEqual(
      expect.objectContaining({ agent: 'googlebot', directive: 'noindex' })
    );
  });

  it('does not mistake max-snippet for an agent scope', () => {
    const d = collectDirectives(headers({ 'X-Robots-Tag': 'max-snippet:0' }), page(''));
    expect(d.scoped).toHaveLength(0);
    expect(d.found.has('max-snippet:0')).toBe(true);
  });
});

describe('collectDirectives — meta tags', () => {
  it('reads meta robots', () => {
    const d = collectDirectives(headers(), page('<meta name="robots" content="noindex">'));
    expect(d.found.has('noindex')).toBe(true);
  });

  it('is case and quote insensitive', () => {
    const d = collectDirectives(headers(), page(`<META NAME='ROBOTS' CONTENT='NoIndex'>`));
    expect(d.found.has('noindex')).toBe(true);
  });

  it('scopes agent-specific meta tags', () => {
    const d = collectDirectives(headers(), page('<meta name="googlebot" content="noindex">'));
    expect(d.scoped).toContainEqual(
      expect.objectContaining({ agent: 'googlebot', directive: 'noindex' })
    );
  });

  it('ignores a meta robots that appears in the body', () => {
    // Article text about noindex must not trip the check.
    const html =
      '<!DOCTYPE html><html><head><title>t</title></head>' +
      '<body><code>&lt;meta name="robots" content="noindex"&gt;</code>' +
      '<meta name="robots" content="noindex"></body></html>';
    const d = collectDirectives(headers(), html);
    expect(d.found.has('noindex')).toBe(false);
  });

  it('ignores unrelated meta tags', () => {
    const d = collectDirectives(
      headers(),
      page('<meta name="description" content="noindex is a thing">')
    );
    expect(d.found.size).toBe(0);
  });
});

describe('blockingDirectives', () => {
  it('reports noindex, nosnippet, noarchive, noai', () => {
    const d = collectDirectives(
      headers({ 'X-Robots-Tag': 'noindex, nosnippet, noarchive, noai' }),
      page('')
    );
    const blocking = blockingDirectives(d).map((b) => b.directive);
    expect(blocking).toEqual(
      expect.arrayContaining(['noindex', 'nosnippet', 'noarchive', 'noai'])
    );
  });

  it('treats max-snippet:0 as blocking', () => {
    const d = collectDirectives(headers({ 'X-Robots-Tag': 'max-snippet:0' }), page(''));
    expect(blockingDirectives(d)).toHaveLength(1);
  });

  it('does not treat max-snippet:-1 as blocking', () => {
    // -1 means "no limit", the opposite of a block.
    const d = collectDirectives(headers({ 'X-Robots-Tag': 'max-snippet:-1' }), page(''));
    expect(blockingDirectives(d)).toHaveLength(0);
  });

  it('ignores harmless directives', () => {
    const d = collectDirectives(
      headers({ 'X-Robots-Tag': 'index, follow, max-image-preview:large' }),
      page('')
    );
    expect(blockingDirectives(d)).toHaveLength(0);
  });

  it('finds nothing on a clean page', () => {
    const d = collectDirectives(headers(), page('<title>Fine</title>'));
    expect(blockingDirectives(d)).toHaveLength(0);
  });
});
