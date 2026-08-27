import type { APIRoute } from 'astro';
import { getResend, getAudienceId, isPlausibleEmail } from '../../lib/email/client';
import { LIMITS, exceeded } from '../../lib/rateLimit';

export const prerender = false;

/*
 * List signup.
 *
 * Adds a contact to a Resend Audience. Deliberately does NOT send anything on
 * signup: the "AI Automation Readiness Checklist" PDF that the old exit popup
 * promised still does not exist, and promising an asset that never arrives is
 * the exact failure this launch pass removed. The form asks for an email and
 * says what it is for, nothing more. Wire a welcome email here the day there
 * is something real to deliver.
 *
 * Uses Resend Audiences rather than a separate marketing ESP so there is one
 * vendor, one API key, and one entry in the privacy policy.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (exceeded(LIMITS.subscribeSource, clientAddress ?? 'unknown')) {
    return json({ error: 'Too many signups from this address just now.' }, 429);
  }

  const resend = getResend();
  const audienceId = getAudienceId();
  if (!resend || !audienceId) {
    console.error('Resend key or RESEND_AUDIENCE_ID missing; refusing signup.');
    return json({ error: 'Signups are not open yet.' }, 503);
  }

  let payload: { email?: unknown; botcheck?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  /*
   * Honeypot, matching the pattern the Web3Forms contact form already uses.
   * A real person never sees the field, so anything in it is a bot. Answer
   * 200 rather than an error: telling a scraper it was caught just teaches
   * it to fill the form differently next time.
   */
  if (payload.botcheck) return json({ ok: true });

  if (!isPlausibleEmail(payload.email)) {
    return json({ error: 'That does not look like an email address.' }, 400);
  }

  try {
    const { error } = await resend.contacts.create({
      email: payload.email.trim(),
      audienceId,
      unsubscribed: false,
    });

    /*
     * A repeat signup is a success from the visitor's point of view - they
     * asked to be on the list and they are on it. Surfacing "already
     * subscribed" would also confirm which addresses are on the list to
     * anyone who cares to probe.
     */
    if (error && !/already exists/i.test(error.message ?? '')) {
      console.error('Resend rejected the contact', error);
      return json({ error: 'That could not be saved. Try again shortly.' }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Subscribe failed', error);
    return json({ error: 'That could not be saved. Try again shortly.' }, 500);
  }
};
