/*
 * Signing for scan reports.
 *
 * The problem this solves: /api/scan-report takes findings from the browser
 * and emails them, from our domain, to an address the browser also supplies.
 * Unsigned, that is an open relay with our sending reputation attached -
 * anyone could POST arbitrary text and have it arrive as a Creative Bandit
 * report. That is a phishing kit, not a feature.
 *
 * Three ways to close it, and why this one:
 *
 *   - Re-run the scan server-side. Unspoofable, but doubles the compute and
 *     the requests we make to the third-party site, and would collide with
 *     the per-target rate limit that just rejected the second scan of the
 *     same host inside a minute.
 *   - Persist the result and pass an id. Correct, but there is no datastore
 *     provisioned yet.
 *   - Sign the payload. Stateless, no extra fetches, no storage. This.
 *
 * /api/scan returns a signature over the exact bytes it produced; the report
 * endpoint recomputes it and refuses anything that does not match. The
 * browser is free to read the payload, and cannot alter it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret(): string | null {
  return (
    import.meta.env.SCAN_REPORT_SECRET ?? process.env.SCAN_REPORT_SECRET ?? null
  );
}

/**
 * Canonical bytes for a scan. Signature covers the URL *and* the findings:
 * over findings alone, a valid report could be relabelled as being about
 * somebody else's site.
 */
function canonical(url: string, findings: unknown): string {
  return JSON.stringify({ url, findings });
}

/** Returns null when no secret is configured, so callers can degrade loudly. */
export function signScan(url: string, findings: unknown): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update(canonical(url, findings)).digest('hex');
}

export function verifyScan(
  url: string,
  findings: unknown,
  signature: unknown
): boolean {
  const expected = signScan(url, findings);
  if (!expected || typeof signature !== 'string') return false;

  /*
   * Shape-checked BEFORE decoding, and this order matters.
   *
   * Buffer.from(x, 'hex') stops at the first character that is not hex and
   * returns the short buffer it managed to decode - it does not throw and it
   * does not pad. So a signature of the right *string* length made entirely
   * of non-hex characters decodes to zero bytes, and timingSafeEqual, which
   * requires equal byte lengths, throws ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH.
   * Comparing string lengths alone does not prevent that; caught by
   * signature.test.ts, which sends exactly that input.
   *
   * The regex pins both alphabet and length (sha256 hex is 64 chars), so
   * anything reaching timingSafeEqual decodes to a full 32 bytes.
   */
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isSigningConfigured(): boolean {
  return getSecret() !== null;
}
