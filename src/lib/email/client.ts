/*
 * Resend client and shared email config.
 *
 * Provisioned through the Vercel Marketplace (`vercel integration add
 * resend/resend-email`), so RESEND_API_KEY is injected into the project
 * automatically rather than pasted in by hand.
 *
 * Everything here is server-only. No PUBLIC_ prefix anywhere: unlike the
 * Web3Forms access key and the analytics site key, this one is a genuine
 * secret - it can send mail as our domain. It must never reach the client
 * bundle, which is why the send endpoints are API routes rather than a
 * fetch straight from the browser.
 */

import { Resend } from 'resend';

/**
 * Lazily constructed. `new Resend(undefined)` throws, and these modules get
 * imported during the build - before the env var exists on a first deploy -
 * so constructing at module scope would break `astro build` rather than
 * failing at the point of use where it can be reported properly.
 */
let client: Resend | null = null;

export function getResend(): Resend | null {
  const key = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

/**
 * Sending identity. The domain has to be verified in Resend before anything
 * sends; until then the API accepts the call and the mail bounces, which is
 * the quiet failure mode worth knowing about.
 */
export const FROM = {
  reports: 'Creative Bandit <scans@creativebandit.studio>',
  list: 'Creative Bandit <hello@creativebandit.studio>',
} as const;

export const REPLY_TO = 'hello@creativebandit.studio';

/** Audience for list email. Set once the audience exists in Resend. */
export function getAudienceId(): string | null {
  return (
    import.meta.env.RESEND_AUDIENCE_ID ?? process.env.RESEND_AUDIENCE_ID ?? null
  );
}

/*
 * Deliberately permissive. Address validation is not a place to be clever:
 * the RFC grammar allows far more than any regex people reach for, and the
 * only authority on whether an address works is whether mail to it arrives.
 * This rejects the obvious typos and nothing else.
 */
export function isPlausibleEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}
