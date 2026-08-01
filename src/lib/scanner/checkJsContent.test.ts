import { describe, it, expect } from 'vitest';
import { extractText, looksLikeAppShell } from './checkJsContent';

/*
 * The live sweep only proved the check does not fire falsely. These prove it
 * fires when it should, without needing to find a real SPA to point at.
 */

describe('extractText', () => {
  it('keeps prose', () => {
    expect(extractText('<p>Hello there</p><p>Second para</p>')).toBe('Hello there Second para');
  });

  it('drops script, style and comments', () => {
    const html = `<style>.a{color:red}</style><!-- note --><script>var x=1;</script><p>Real copy</p>`;
    expect(extractText(html)).toBe('Real copy');
  });

  it('drops inline SVG', () => {
    /*
     * The regression that made this function necessary: linear.app ships 179
     * inline SVGs and a 261KB stylesheet, and naive tag-stripping measured
     * its homepage at 834KB of "text", making the ratio meaningless.
     */
    const svg = '<svg viewBox="0 0 10 10"><title>icon</title><path d="M0 0h10v10z"/></svg>';
    expect(extractText(`${svg}<p>Copy</p>`)).toBe('Copy');
  });

  it('drops noscript, template and iframe content', () => {
    const html =
      '<noscript>Enable JS</noscript><template><b>tpl</b></template>' +
      '<iframe><p>embedded</p></iframe><p>Copy</p>';
    expect(extractText(html)).toBe('Copy');
  });

  it('collapses whitespace and entities', () => {
    expect(extractText('<p>A&nbsp;&nbsp;B</p>\n\n   <p>C</p>')).toBe('A B C');
  });
});

describe('looksLikeAppShell', () => {
  const shell = (id: string) =>
    `<!DOCTYPE html><html><head><title>App</title></head><body><div id="${id}"></div><script src="/bundle.js"></script></body></html>`;

  it.each(['root', 'app', '__next', '___gatsby', '__nuxt'])(
    'detects an empty #%s mount point',
    (id) => {
      expect(looksLikeAppShell(shell(id))).toBe(true);
    }
  );

  it('is not fooled by a mount point that already contains content', () => {
    const html =
      '<div id="root"><h1>Server rendered heading</h1>' +
      `<p>${'Real content. '.repeat(60)}</p></div>`;
    expect(looksLikeAppShell(html)).toBe(false);
  });

  it('does not fire on an ordinary content page', () => {
    const html = `<body><main><h1>About us</h1><p>${'We do things. '.repeat(60)}</p></main></body>`;
    expect(looksLikeAppShell(html)).toBe(false);
  });

  it('does not fire on a short page that has no mount point', () => {
    // Thin but server-rendered - a stub page, not a shell.
    expect(looksLikeAppShell('<body><h1>Coming soon</h1></body>')).toBe(false);
  });
});
