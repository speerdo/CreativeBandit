import type { APIRoute } from 'astro';
import type { ScanResult } from '../../lib/scanner/types';
import { getResend, FROM, REPLY_TO, isPlausibleEmail } from '../../lib/email/client';
import { verifyScan, isSigningConfigured } from '../../lib/email/signature';
import { renderReportHtml, renderReportText } from '../../lib/email/reportTemplate';
import { LIMITS, exceeded } from '../../lib/rateLimit';

export const prerender = false;

/*
 * Emails a scan report the visitor has already seen on screen.
 *
 * The scan itself stays ungated - that is a positioning decision, not an
 * oversight, and the copy promises it in four places ("no account, no
 * discovery call, no form that asks for your budget range before it tells
 * you anything"). Capture happens *after* the findings render, where the ask
 * is a convenience rather than a toll and the intent is far higher. See
 * docs/creative-bandit-launch-readiness.md §9.1.
 *
 * Everything here treats the request body as hostile, because it is: the
 * findings arrive from the browser and get mailed out over our sending
 * domain. The signature check is what stops that being an open relay.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? 'unknown';
  if (exceeded(LIMITS.reportSource, ip)) {
    return json({ error: 'Too many reports requested just now. Try again shortly.' }, 429);
  }

  /*
   * Both refusals are 503, not 500: the request is fine, we are not
   * configured. Failing loudly here is deliberate - the alternative is
   * sending an unverifiable report, or silently doing nothing while the UI
   * claims success, and this launch spent a lot of effort removing exactly
   * that pattern.
   */
  const resend = getResend();
  if (!resend) {
    console.error('RESEND_API_KEY is not set; refusing to send.');
    return json({ error: 'Email delivery is not configured yet.' }, 503);
  }
  if (!isSigningConfigured()) {
    console.error('SCAN_REPORT_SECRET is not set; refusing to send unverifiable findings.');
    return json({ error: 'Email delivery is not configured yet.' }, 503);
  }

  let payload: { email?: unknown; result?: unknown; signature?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  if (!isPlausibleEmail(payload.email)) {
    return json({ error: 'That does not look like an email address.' }, 400);
  }
  const email = payload.email.trim();

  const result = payload.result as ScanResult | undefined;
  if (!result || typeof result.url !== 'string' || !Array.isArray(result.findings)) {
    return json({ error: 'Expected a scan result.' }, 400);
  }

  /*
   * The whole security model. Recomputed over the exact URL and findings
   * /api/scan produced; anything altered in the browser fails here.
   */
  if (!verifyScan(result.url, result.findings, payload.signature)) {
    console.warn('Rejected scan-report with a bad signature.');
    return json({ error: 'That report could not be verified. Run the scan again.' }, 400);
  }

  // Per-recipient, so a valid signature cannot be replayed to bomb one inbox.
  if (exceeded(LIMITS.reportRecipient, email.toLowerCase())) {
    return json({ error: 'That address has already been sent this report.' }, 429);
  }

  const host = (() => {
    try {
      return new URL(result.url).hostname;
    } catch {
      return result.url;
    }
  })();

  try {
    const { error } = await resend.emails.send({
      from: FROM.reports,
      to: email,
      replyTo: REPLY_TO,
      subject: `AI readiness scan — ${host}`,
      html: renderReportHtml(result),
      text: renderReportText(result),
    });

    if (error) {
      // Resend returns errors in the body rather than throwing.
      console.error('Resend rejected the report send', error);
      return json({ error: 'The report could not be sent. Try again shortly.' }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Report send failed', error);
    return json({ error: 'The report could not be sent. Try again shortly.' }, 500);
  }
};
