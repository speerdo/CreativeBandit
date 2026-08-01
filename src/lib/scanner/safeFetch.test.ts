import { describe, it, expect } from 'vitest';
import { isBlockedAddress, validateTarget, BlockedUrlError } from './safeFetch';

/*
 * These are the cases from docs/creative-bandit-ai-readiness-scan.md §6.
 * The scanner fetches attacker-supplied URLs server-side, so a regression
 * here is a credential-disclosure bug, not a cosmetic one.
 */

describe('isBlockedAddress — IPv4', () => {
  it('blocks the cloud metadata endpoint', () => {
    // The one that actually leaks credentials on AWS/GCP/Azure.
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
  });

  it.each([
    ['10.0.0.1', 'private 10/8'],
    ['172.16.0.1', 'private 172.16/12'],
    ['172.31.255.255', 'private 172.16/12 upper bound'],
    ['192.168.1.1', 'private 192.168/16'],
    ['127.0.0.1', 'loopback'],
    ['0.0.0.0', 'this network'],
    ['169.254.1.1', 'link-local'],
    ['100.64.0.1', 'CGNAT'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['172.15.0.1'], // just below the private range
    ['172.32.0.1'], // just above it
    ['93.184.216.34'],
  ])('allows public address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('allows Automattic space inside 192.0.0.0/16', () => {
    /*
     * Regression: blocking the whole /16 refused woocommerce.com and every
     * WordPress.com-hosted site, which is the core audience. Only
     * 192.0.0.0/24 and 192.0.2.0/24 are reserved.
     */
    expect(isBlockedAddress('192.0.66.5')).toBe(false);
    expect(isBlockedAddress('192.0.78.12')).toBe(false);
    expect(isBlockedAddress('192.0.0.1')).toBe(true);
    expect(isBlockedAddress('192.0.2.1')).toBe(true);
  });

  it.each([
    ['198.51.100.1', 'TEST-NET-2'],
    ['203.0.113.1', 'TEST-NET-3'],
    ['192.88.99.1', '6to4 relay anycast'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });
});

describe('isBlockedAddress — IPv6', () => {
  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique local'],
    ['fd12:3456::1', 'unique local'],
    ['fe80::1', 'link-local'],
    ['ff02::1', 'multicast'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it('blocks IPv4-mapped private space', () => {
    // ::ffff:169.254.169.254 reaches metadata on a v6-only check.
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('allows public v6', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('isBlockedAddress — malformed input', () => {
  it.each(['not-an-ip', '', '999.999.999.999', '10.0.0', '10.0.0.1.5'])(
    'refuses %s rather than guessing',
    (value) => {
      expect(isBlockedAddress(value)).toBe(true);
    }
  );
});

describe('validateTarget', () => {
  it.each([
    ['file:///etc/passwd', 'file scheme'],
    ['gopher://example.com/', 'gopher scheme'],
    ['ftp://example.com/', 'ftp scheme'],
  ])('rejects %s (%s)', async (url) => {
    await expect(validateTarget(url)).rejects.toThrow(BlockedUrlError);
  });

  it.each([
    ['http://localhost/', 'localhost'],
    ['http://foo.localhost/', 'localhost subdomain'],
    ['http://thing.internal/', '.internal'],
    ['http://printer.local/', '.local'],
    ['http://metadata.google.internal/', 'GCP metadata by name'],
  ])('rejects %s (%s)', async (url) => {
    await expect(validateTarget(url)).rejects.toThrow(BlockedUrlError);
  });

  it('rejects bare private IP literals', async () => {
    await expect(validateTarget('http://169.254.169.254/')).rejects.toThrow(BlockedUrlError);
    await expect(validateTarget('http://127.0.0.1:8080/')).rejects.toThrow(BlockedUrlError);
    await expect(validateTarget('http://[::1]/')).rejects.toThrow(BlockedUrlError);
  });

  it('rejects embedded credentials', async () => {
    await expect(validateTarget('http://user:pass@example.com/')).rejects.toThrow(
      BlockedUrlError
    );
  });

  it('rejects garbage', async () => {
    await expect(validateTarget('not a url')).rejects.toThrow(BlockedUrlError);
    await expect(validateTarget('')).rejects.toThrow(BlockedUrlError);
  });

  it('accepts a public host and pins a resolved address', async () => {
    const target = await validateTarget('https://example.com/');
    expect(target.url.hostname).toBe('example.com');
    expect(isBlockedAddress(target.address)).toBe(false);
  });
});
