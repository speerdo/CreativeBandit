import type { APIRoute } from 'astro';
import { runScan, UnreachableSiteError } from '../../lib/scanner/scan';
import { BlockedUrlError } from '../../lib/scanner/safeFetch';

/*
 * The only server-rendered route on the site. Everything else stays
 * prerendered exactly as it was; see the note in astro.config.mjs.
 */
export const prerender = false;

/*
 * Rate limiting. Spec §6.
 *
 * Two independent limits, because they defend against different things:
 *
 *   per source  - one person hammering the endpoint, wasting our compute.
 *   per target  - the endpoint being used to point traffic at somebody
 *                 else's site in volume. A free unauthenticated scanner is
 *                 otherwise a small DDoS amplifier, and each scan is ~30
 *                 requests to the target. This one matters more: the cost
 *                 lands on a third party who never opted in.
 *
 * Still in-process, so it resets on cold start and each instance counts
 * separately. That is a real limitation and the durable answer is the WAF
 * (§2.4) - but per-target limiting was missing entirely, and the in-process
 * version stops the obvious abuse rather than nothing at all.
 */
const WINDOW_MS = 60_000;
const MAX_PER_SOURCE = 5;
/*
 * Deliberately lower than the source limit. Several people legitimately
 * scanning different sites is normal; several scans of one site in a minute
 * is not something a real user does.
 */
const MAX_PER_TARGET = 3;

const sourceHits = new Map<string, number[]>();
const targetHits = new Map<string, number[]>();

function hit(store: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const recent = (store.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  store.set(key, recent);

  // Opportunistic sweep so the map cannot grow without bound.
  if (store.size > 500) {
    for (const [k, times] of store) {
      if (times.every((t) => now - t >= WINDOW_MS)) store.delete(k);
    }
  }

  return recent.length > max;
}

/**
 * The registrable-ish host, so `a.example.com` and `b.example.com` share a
 * budget. Not a public-suffix implementation - the last two labels are close
 * enough to stop the obvious way of side-stepping a per-host limit.
 */
function targetKey(rawUrl: string): string | null {
  try {
    const host = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).hostname;
    return host.split('.').slice(-2).join('.').toLowerCase();
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? 'unknown';
  if (hit(sourceHits, ip, MAX_PER_SOURCE)) {
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
  if (target && hit(targetHits, target, MAX_PER_TARGET)) {
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
    return json(result);
  } catch (error) {
    if (error instanceof BlockedUrlError || error instanceof UnreachableSiteError) {
      return json({ error: error.message }, 400);
    }
    console.error('Scan failed', error);
    return json({ error: 'The scan could not complete. Try again shortly.' }, 500);
  }
};
