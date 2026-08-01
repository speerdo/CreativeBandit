import { safeFetch } from './safeFetch';
import type { Finding } from './types';

/*
 * Check 4 — llms.txt presence. Spec §3.4.
 *
 * Soft-404 detection is the whole job. Many WordPress sites return the
 * themed 404 page with a 200 status, so a presence check that only looks
 * at the status code reports llms.txt on nearly every site in the world.
 * We fetch a known-bogus same-origin control path once and compare; that
 * probe is only safe to run on the site the user attested to managing,
 * which is exactly our position.
 *
 * Honest framing, per spec: adoption by real crawlers is early, and this
 * finding is a 20-minute positioning win, not a fix for a live problem.
 */

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 1000).toLowerCase().trimStart();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

/** The shape spec §3.4 requires: an H1 and at least one markdown link. */
function hasLlmsTxtShape(body: string): boolean {
  return /^#\s+.+/m.test(body) && /\[[^\]]+\]\([^)]+\)/.test(body);
}

/** A real 404 page in the site's theme; fetched once per origin. */
async function fetchSoft404Control(origin: string): Promise<{ status: number; body: string } | null> {
  try {
    const response = await safeFetch(`${origin}/_cb_scan_probe_404`, { timeoutMs: 5000 });
    return { status: response.status, body: response.body.slice(0, 4000) };
  } catch {
    return null;
  }
}

export async function checkLlmsTxt(origin: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const control = await fetchSoft404Control(origin);

  for (const filename of ['/llms.txt', '/llms-full.txt']) {
    let response;
    try {
      response = await safeFetch(`${origin}${filename}`, {
        accept: 'text/plain,*/*;q=0.8',
        timeoutMs: 4000,
      });
    } catch {
      continue;
    }

    const body = response.body.slice(0, 8000);
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

    const looksReal =
      response.status === 200 &&
      !contentType.includes('text/html') &&
      !looksLikeHtml(body) &&
      // Themed soft-404s return the 404 template with a 200; compare with the control.
      !(
        control &&
        control.status === 200 &&
        // Identical body start means it is the themed 404, not a real file.
        control.body.length > 0 &&
        body.slice(0, 1000) === control.body.slice(0, 1000)
      );

    if (!looksReal) continue;

    if (!hasLlmsTxtShape(body)) {
      findings.push({
        id: 'llms-txt-malformed',
        check: 'llms-txt',
        tag: 'opportunity',
        title: `${filename} exists but doesn't look like an llms.txt file`,
        detail:
          'The file is present but lacks the expected shape - an H1 heading and at least ' +
          'one markdown link. An assistant would open it and find nothing it can use.',
        evidence: { quote: body.slice(0, 120).replace(/\s+/g, ' '), source: `${origin}${filename}` },
        remediation:
          'Add an H1 naming the business and a list of links to the pages a client ' +
          'would actually ask about - services, pricing, about.',
        weight: 20,
      });
      return findings;
    }

    findings.push({
      id: 'llms-txt-present',
      check: 'llms-txt',
      tag: 'good',
      title: `${filename} is present`,
      detail:
        'Adoption by real assistants is still early, but you are ahead of almost every ' +
        'competitor simply by having one.',
      evidence: { source: `${origin}${filename}` },
      remediation: 'No action needed.',
      weight: 15,
    });
    return findings;
  }

  findings.push({
    id: 'llms-txt-missing',
    check: 'llms-txt',
    tag: 'opportunity',
    title: 'No llms.txt',
    detail:
      'Adoption is still early and no major assistant requires one, but it is a 20-minute ' +
      'job and it puts you ahead of essentially every competitor in this space.',
    evidence: { source: `${origin}/llms.txt` },
    remediation:
      'Add /llms.txt with an H1 naming the business and markdown links to the pages ' +
      'a prospective client would actually ask about.',
    weight: 25,
  });

  return findings;
}
