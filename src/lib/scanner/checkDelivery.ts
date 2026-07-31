import { safeFetch, type SafeResponse } from './safeFetch';
import type { Finding } from './types';

/*
 * Check 6 — delivery and hygiene.
 *
 * Scope note, because this is the check most at risk of turning the report
 * into generic tool output (spec §1 non-goals):
 *
 * The first three items below are on-thesis. A crawler that cannot resolve a
 * canonical host, or that burns its budget on a redirect chain, does not read
 * the site - that is an AI readiness problem wearing an infrastructure hat.
 *
 * The security-header item is NOT AI readiness, and is included deliberately
 * as a single low-weight finding at the bottom of the report. It is capped at
 * one finding on purpose: every free scanner reports these, so leading with
 * them would make us look like securityheaders.io with extra steps, in front
 * of an audience specifically evaluating whether we know more than they do.
 */

/** Reported as one finding, never five. */
const SECURITY_HEADERS: { header: string; label: string }[] = [
  { header: 'strict-transport-security', label: 'Strict-Transport-Security' },
  { header: 'content-security-policy', label: 'Content-Security-Policy' },
  { header: 'x-content-type-options', label: 'X-Content-Type-Options' },
  { header: 'referrer-policy', label: 'Referrer-Policy' },
  { header: 'x-frame-options', label: 'X-Frame-Options' },
];

export async function checkDelivery(
  siteUrl: string,
  control: SafeResponse
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const final = new URL(control.url);
  const origin = final.origin;

  // --- HTTPS ---------------------------------------------------------------
  if (final.protocol !== 'https:') {
    findings.push({
      id: 'delivery-no-https',
      check: 'delivery',
      tag: 'gap',
      title: 'The site does not redirect to HTTPS',
      detail:
        'Requests stay on plain HTTP. Crawlers increasingly treat that as untrusted, and any ' +
        'assistant citing the site will be citing an insecure URL.',
      evidence: { source: control.url },
      remediation:
        'Force HTTPS at the host or CDN and redirect HTTP to it with a single 301.',
      weight: 85,
    });
  }

  // --- redirect chain ------------------------------------------------------
  if (control.redirects >= 3) {
    findings.push({
      id: 'delivery-redirect-chain',
      check: 'delivery',
      tag: 'gap',
      title: `The homepage takes ${control.redirects} redirects to resolve`,
      detail:
        'Every hop is a request a crawler has to spend before it sees content, and some stop ' +
        'following before the end of a long chain.',
      evidence: { source: `${siteUrl} -> ${control.url}` },
      remediation: 'Collapse the chain so the entry URL lands on the final URL in one hop.',
      weight: 55,
    });
  }

  // --- www / non-www canonicalisation --------------------------------------
  /*
   * If both hostnames serve a 200 independently, a crawler sees two complete
   * copies of the site and splits its signals between them. One extra
   * request, and it is a genuinely common WordPress misconfiguration.
   */
  const host = final.hostname;
  const sibling = host.startsWith('www.') ? host.slice(4) : `www.${host}`;

  try {
    const siblingUrl = `${final.protocol}//${sibling}${final.port ? `:${final.port}` : ''}/`;
    const response = await safeFetch(siblingUrl, { timeoutMs: 5000 });

    // A 200 with no redirect back to the canonical host means both are live.
    const landed = new URL(response.url).hostname;
    if (response.status === 200 && landed === sibling) {
      findings.push({
        id: 'delivery-both-hosts',
        check: 'delivery',
        tag: 'gap',
        title: `Both ${host} and ${sibling} serve the site`,
        detail:
          'Neither redirects to the other, so crawlers can index two full copies and split ' +
          'ranking and citation signals between them.',
        evidence: { source: siblingUrl },
        remediation: `Pick one as canonical and 301 the other to it.`,
        weight: 70,
      });
    }
  } catch {
    // The sibling not resolving is the correct, common case. Not a finding.
  }

  // --- security headers ----------------------------------------------------
  const missing = SECURITY_HEADERS.filter(({ header }) => !control.headers.get(header));

  if (missing.length > 0) {
    findings.push({
      id: 'delivery-security-headers',
      check: 'delivery',
      tag: 'opportunity',
      title: `${missing.length} of ${SECURITY_HEADERS.length} common security headers are missing`,
      detail:
        'Not an AI readiness problem, and included here only because it is cheap to fix and ' +
        'clients ask about it. Nothing here stops an assistant reading the site.',
      evidence: { quote: missing.map((m) => m.label).join(', '), source: origin },
      remediation:
        'Add them at the CDN or in the server config. On Cloudflare these can be set globally ' +
        'with a Transform Rule rather than touching the origin.',
      // Below every AI finding, including the good news, so it lands last.
      weight: 5,
    });
  } else {
    findings.push({
      id: 'delivery-security-headers-clean',
      check: 'delivery',
      tag: 'good',
      title: 'Security headers are all present',
      detail: 'HSTS, CSP, nosniff, Referrer-Policy and frame protection are all set.',
      evidence: { source: origin },
      remediation: 'No action needed.',
      weight: 5,
    });
  }

  return findings;
}
