import { describe, it, expect, beforeAll } from 'vitest';
import { signScan, verifyScan, isSigningConfigured } from './signature';

/*
 * The signature is the only thing standing between /api/scan-report and being
 * an open relay that sends attacker-written text from our domain. These tests
 * exist because that failure would be invisible until someone used it.
 */

const SECRET = 'test-secret-not-the-real-one';
const URL = 'https://example.com';
const FINDINGS = [
  { id: 'robots-ai-blocked', tag: 'gap', title: 'GPTBot is blocked', remediation: 'Allow it' },
];

beforeAll(() => {
  process.env.SCAN_REPORT_SECRET = SECRET;
});

describe('signScan / verifyScan', () => {
  it('verifies a signature it just produced', () => {
    expect(verifyScan(URL, FINDINGS, signScan(URL, FINDINGS))).toBe(true);
  });

  it('rejects edited findings', () => {
    const sig = signScan(URL, FINDINGS);
    const tampered = [{ ...FINDINGS[0], title: 'Your account is suspended. Send bitcoin.' }];
    expect(verifyScan(URL, tampered, sig)).toBe(false);
  });

  it('rejects a valid report relabelled as another site', () => {
    // The signature covers the URL as well as the findings, so a genuine
    // report cannot be passed off as being about somebody else's site.
    const sig = signScan(URL, FINDINGS);
    expect(verifyScan('https://someone-else.com', FINDINGS, sig)).toBe(false);
  });

  it('rejects a truncated signature', () => {
    const sig = signScan(URL, FINDINGS)!;
    expect(verifyScan(URL, FINDINGS, sig.slice(0, -2))).toBe(false);
  });

  it('rejects a same-length non-hex signature without throwing', () => {
    /*
     * Regression test. Buffer.from(x, 'hex') stops at the first non-hex
     * character and returns a SHORT buffer rather than throwing, so a
     * signature of the correct string length made of non-hex characters
     * decoded to zero bytes and made timingSafeEqual throw
     * ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH - a 500 out of the endpoint
     * instead of a clean 400. Comparing string lengths did not catch it.
     */
    const sig = signScan(URL, FINDINGS)!;
    expect(() => verifyScan(URL, FINDINGS, 'z'.repeat(sig.length))).not.toThrow();
    expect(verifyScan(URL, FINDINGS, 'z'.repeat(sig.length))).toBe(false);
  });

  it('rejects non-string signatures', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(verifyScan(URL, FINDINGS, bad)).toBe(false);
    }
  });

  it('refuses to sign or verify when no secret is configured', () => {
    delete process.env.SCAN_REPORT_SECRET;
    expect(isSigningConfigured()).toBe(false);
    expect(signScan(URL, FINDINGS)).toBeNull();
    // Fails closed: with no secret nothing can be verified, so nothing sends.
    expect(verifyScan(URL, FINDINGS, 'a'.repeat(64))).toBe(false);
    process.env.SCAN_REPORT_SECRET = SECRET;
  });
});
