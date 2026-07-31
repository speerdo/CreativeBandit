import type { APIRoute } from 'astro';
import { runScan, UnreachableSiteError } from '../../lib/scanner/scan';
import { BlockedUrlError } from '../../lib/scanner/safeFetch';

/*
 * The only server-rendered route on the site. Everything else stays
 * prerendered exactly as it was; see the note in astro.config.mjs.
 */
export const prerender = false;

/*
 * Rate limiting.
 *
 * In-memory, so it resets on cold start and is per-instance rather than
 * global. That is not real protection - it is a speed bump that stops a
 * single tab hammering the endpoint. Spec §6 requires proper per-IP and
 * per-target limits before this is publicly linked, which needs shared
 * state (Redis, or the Postgres instance that arrives with phase 2).
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (hits.size > 500) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return recent.length > MAX_PER_WINDOW;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? 'unknown';
  if (rateLimited(ip)) {
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
