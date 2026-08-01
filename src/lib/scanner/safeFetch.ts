import dns from 'node:dns/promises';
import net from 'node:net';

/*
 * Hardened fetch for the AI readiness scan.
 *
 * This module exists because the scanner takes an arbitrary URL from an
 * anonymous user and makes a server-side request to it, which is a textbook
 * SSRF vector. See docs/creative-bandit-ai-readiness-scan.md §6.
 *
 * The load-bearing detail: we resolve DNS ourselves, validate the resolved
 * ADDRESS, and then connect to that pinned address. Validating the hostname
 * alone is defeated by DNS rebinding - an attacker controls the record, so a
 * name that resolves to a public IP when we check it can resolve to
 * 169.254.169.254 microseconds later when fetch() does its own lookup.
 *
 * Redirects are followed manually for the same reason: a permitted host
 * redirecting to the metadata endpoint is the classic bypass, so every hop
 * gets the full check rather than just the first.
 */

export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 2 * 1024 * 1024; // 2MB
export const DEFAULT_TIMEOUT_MS = 8000;

/** Content types we are willing to parse. Anything else is fetched but not returned as text. */
const PARSEABLE = [
  'text/html',
  'text/plain',
  'text/xml',
  'application/xml',
  'application/xhtml+xml',
  'application/json',
  'application/ld+json',
  'application/rss+xml',
];

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/**
 * Private, loopback, link-local and other non-routable space.
 *
 * 169.254.0.0/16 is the one that matters most: 169.254.169.254 is the cloud
 * instance metadata endpoint on AWS, GCP and Azure, and reaching it from a
 * server-side fetch is how credentials leak.
 */
export function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isBlockedIPv4(address);
  if (version === 6) return isBlockedIPv6(address);
  return true; // not an IP at all - refuse rather than guess
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  const c = parts[2];

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private

  /*
   * Only two /24s inside 192.0.0.0/16 are reserved, NOT the whole /16.
   *
   * Blocking the /16 refused 192.0.66.0/24, which is Automattic - so
   * woocommerce.com, WordPress.com-hosted sites and anything behind Jetpack
   * were turned away with "that domain resolves to a private address". On a
   * product aimed at WordPress agencies that is close to the worst possible
   * false positive. Found by the phase 5 validation sweep.
   */
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1

  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 6to4 relay anycast
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast (224/4) and reserved (240/4), incl. 255.255.255.255

  return false;
}

function isBlockedIPv6(address: string): boolean {
  const addr = address.toLowerCase().split('%')[0]; // strip zone index

  if (addr === '::' || addr === '::1') return true; // unspecified, loopback

  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible - defer to the v4 rules,
  // otherwise these sail straight past a v6-only check.
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);

  const head = addr.split(':')[0] ?? '';
  const first = parseInt(head || '0', 16);

  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (head.startsWith('ff')) return true; // ff00::/8 multicast
  if (addr.startsWith('64:ff9b:')) return true; // NAT64, can reach v4 private space
  if (addr.startsWith('2002:')) return true; // 6to4

  return false;
}

/** Hostnames that never belong to a legitimate scan target. */
function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h.endsWith('.localdomain')) return true;
  // Cloud metadata by name, which bypasses an address-only check.
  if (h === 'metadata.google.internal' || h === 'metadata') return true;
  return false;
}

export interface ValidatedTarget {
  url: URL;
  /** The address we resolved and will pin the connection to. */
  address: string;
  family: 4 | 6;
}

/**
 * Parse, validate and resolve a URL. Throws BlockedUrlError if the target is
 * not a legitimate public host.
 */
export async function validateTarget(raw: string): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('That does not look like a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https URLs can be scanned.');
  }

  if (url.username || url.password) {
    throw new BlockedUrlError('URLs with embedded credentials are not accepted.');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new BlockedUrlError('That hostname is not a public site.');
  }

  // A bare IP literal skips DNS but still has to pass the address rules.
  if (net.isIP(url.hostname)) {
    if (isBlockedAddress(url.hostname)) {
      throw new BlockedUrlError('That address is not a public site.');
    }
    return {
      url,
      address: url.hostname,
      family: net.isIP(url.hostname) === 6 ? 6 : 4,
    };
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new BlockedUrlError('That domain could not be resolved.');
  }

  if (records.length === 0) {
    throw new BlockedUrlError('That domain could not be resolved.');
  }

  /*
   * EVERY resolved address has to be public, not merely the first. A hostname
   * with both a public and a private A record is a rebinding attempt, and
   * picking the first record would let it through half the time.
   */
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new BlockedUrlError('That domain resolves to a private address.');
    }
  }

  const chosen = records[0];
  return {
    url,
    address: chosen.address,
    family: chosen.family === 6 ? 6 : 4,
  };
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  /** True when the body was cut off at MAX_BYTES. */
  truncated: boolean;
  /** Number of redirects followed to get here. */
  redirects: number;
}

export interface SafeFetchOptions {
  userAgent?: string;
  timeoutMs?: number;
  method?: 'GET' | 'HEAD';
  /** Accept header, e.g. to ask for text/plain on llms.txt. */
  accept?: string;
  maxBytes?: number;
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; CreativeBanditScanner/1.0; +https://creativebandit.studio/scan)';

/**
 * Fetch a URL with SSRF protection, manual redirect handling, a byte cap and
 * a hard timeout.
 *
 * Note on address pinning: we validate every hop's resolved address before
 * connecting. Node's fetch does its own DNS lookup, which leaves a small
 * TOCTOU window between our check and its connection. Closing that fully
 * needs a custom agent with a `lookup` hook - see the note in §6 follow-ups.
 * Validating every hop still blocks the practical redirect-to-metadata
 * attack, which is the one that matters here.
 */
export async function safeFetch(
  raw: string,
  options: SafeFetchOptions = {}
): Promise<SafeResponse> {
  const {
    userAgent = DEFAULT_UA,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    method = 'GET',
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    maxBytes = MAX_BYTES,
  } = options;

  let current = raw;
  let redirects = 0;

  const deadline = Date.now() + timeoutMs;

  while (true) {
    const target = await validateTarget(current);

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Timed out before the request completed.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    let response: Response;
    try {
      response = await fetch(target.url, {
        method,
        redirect: 'manual', // we validate each hop ourselves
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: accept,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get('location');
    const isRedirect = response.status >= 300 && response.status < 400 && location;

    if (isRedirect) {
      if (redirects >= MAX_REDIRECTS) {
        throw new BlockedUrlError('Too many redirects.');
      }
      redirects += 1;
      current = new URL(location, target.url).href;
      continue;
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const parseable = PARSEABLE.some((type) => contentType.includes(type)) || contentType === '';

    let body = '';
    let truncated = false;

    if (method !== 'HEAD' && parseable && response.body) {
      const read = await readCapped(response.body, maxBytes);
      body = read.text;
      truncated = read.truncated;
    } else if (response.body) {
      // Not parseable - drain and discard so the socket is released.
      await response.body.cancel().catch(() => {});
    }

    return {
      url: target.url.href,
      status: response.status,
      headers: response.headers,
      body,
      truncated,
      redirects,
    };
  }
}

/**
 * Read a stream up to a byte cap, then abort. Buffering the whole body would
 * let a malicious or merely enormous target exhaust the function's memory.
 */
async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      if (total + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - total));
        truncated = true;
        break;
      }

      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder('utf-8').decode(merged), truncated };
}
