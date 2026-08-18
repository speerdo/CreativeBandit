import type { APIRoute } from 'astro';
import { runScan, UnreachableSiteError } from '../../lib/scanner/scan';
import { BlockedUrlError } from '../../lib/scanner/safeFetch';
import { signScan } from '../../lib/email/signature';
import { LIMITS, exceeded, targetKey } from '../../lib/rateLimit';

/*
 * The only server-rendered route on the site. Everything else stays
 * prerendered exactly as it was; see the note in astro.config.mjs.
 */
export const prerender = false;

/*
 * Rate limiting. Spec §6. Two independent limits, because they defend against
 * different things - one person hammering us, versus the endpoint being used
 * to point traffic at somebody else's site in volume. The second matters
 * more: each scan is ~30 requests, and the cost lands on a third party who
 * never opted in.
 *
 * The limiter itself now lives in lib/rateLimit.ts, shared with the report
 * and subscribe routes, and carries the note about it still being
 * in-process.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? 'unknown';
  if (exceeded(LIMITS.scanSource, ip)) {
    return json({ error: 'Too many scans from this address. Try again in a minute.' }, 429);
  }

  let payload: { url?: unknown; attested?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  if (typeof payload.url !== 'string') {
    return json({ error: 'Expected a url.' }, 400);
  }

  /*
   * Checked before the scan starts, so a rejected request costs the target
   * nothing. The limit protects a third party, not us.
   */
  const target = targetKey(payload.url);
  if (target && exceeded(LIMITS.scanTarget, target)) {
    return json(
      { error: 'That site has been scanned several times just now. Give it a minute.' },
      429
    );
  }

  /*
   * Ownership attestation (spec §6). This is what makes the edge probe's UA
   * emulation defensible: we are running a diagnostic at the request of
   * someone who says they are responsible for the site.
   */
  if (payload.attested !== true) {
    return json({ error: 'Confirm you manage this site before scanning it.' }, 400);
  }

  try {
    const result = await runScan(payload.url);
    /*
     * Signed so /api/scan-report can email these findings without trusting
     * the browser not to have rewritten them on the way back. Null when no
     * secret is set, in which case the report endpoint refuses to send
     * rather than sending something it cannot vouch for. See
     * lib/email/signature.ts for why this beats re-scanning or persisting.
     */
    return json({ ...result, signature: signScan(result.url, result.findings) });
  } catch (error) {
    if (error instanceof BlockedUrlError || error instanceof UnreachableSiteError) {
      return json({ error: error.message }, 400);
    }
    console.error('Scan failed', error);
    return json({ error: 'The scan could not complete. Try again shortly.' }, 500);
  }
};
