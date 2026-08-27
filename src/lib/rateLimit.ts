/*
 * Shared fixed-window rate limiting for the API routes.
 *
 * Extracted from api/scan.ts, which had this inline, once /api/scan-report
 * and /api/subscribe needed the same thing. Three copies of a limiter is
 * three places to get it subtly different, and - more to the point - three
 * places to edit when this moves to shared state.
 *
 * ---------------------------------------------------------------------------
 * STILL IN-PROCESS. This is the known gap, not an oversight.
 * ---------------------------------------------------------------------------
 *
 * State lives in a module-level Map, so it is per-instance and resets on cold
 * start. Under Fluid compute one instance serves many requests, so it does
 * work - but it is a speed bump, not a guarantee, and someone who wants past
 * it only has to arrive on a cold instance.
 *
 * The durable fix is Upstash Redis + @upstash/ratelimit; every limit below
 * maps onto `Ratelimit.slidingWindow(max, windowSeconds)` with the same
 * numbers, and `check()` is the only function that changes. See
 * docs/creative-bandit-launch-readiness.md §9.2 for the provisioning steps.
 *
 * The per-target limit in the scan route is the one that actually matters:
 * it protects a third-party site from being scanned in volume by way of our
 * endpoint, and that cost lands on someone who never opted in.
 */

interface Bucket {
  hits: number[];
}

const store = new Map<string, Bucket>();

export interface Limit {
  /** Requests permitted inside the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Namespace, so two limits cannot collide on the same key. */
  prefix: string;
}

export const LIMITS = {
  /** One person hammering the scanner, wasting our compute. */
  scanSource: { max: 5, windowMs: 60_000, prefix: 'scan:src' },
  /**
   * Deliberately lower than the source limit. Several people scanning
   * different sites is normal; several scans of one site inside a minute is
   * not something a real user does.
   */
  scanTarget: { max: 3, windowMs: 60_000, prefix: 'scan:tgt' },
  /**
   * Report delivery. Tighter than the scan itself: the scan costs us compute,
   * but this one puts mail in somebody's inbox from our sending domain, and
   * the reputation damage from being used to bomb an address is not
   * recoverable by rate limit alone.
   */
  reportSource: { max: 3, windowMs: 300_000, prefix: 'report:src' },
  /** Same address requested repeatedly - almost certainly not the owner. */
  reportRecipient: { max: 2, windowMs: 3_600_000, prefix: 'report:to' },
  /** List signups. Generous, since a real person only ever does this once. */
  subscribeSource: { max: 3, windowMs: 600_000, prefix: 'sub:src' },
} as const satisfies Record<string, Limit>;

/**
 * Records a hit and reports whether the caller has now exceeded the limit.
 *
 * @returns true when the request should be REJECTED.
 */
export function exceeded(limit: Limit, key: string): boolean {
  const now = Date.now();
  const id = `${limit.prefix}:${key}`;
  const recent = (store.get(id)?.hits ?? []).filter((t) => now - t < limit.windowMs);
  recent.push(now);
  store.set(id, { hits: recent });

  // Opportunistic sweep so the map cannot grow without bound. Cheap because
  // it only runs once the map is already large.
  if (store.size > 500) {
    for (const [k, bucket] of store) {
      if (bucket.hits.every((t) => now - t >= limit.windowMs)) store.delete(k);
    }
  }

  return recent.length > limit.max;
}

/**
 * The registrable-ish host, so `a.example.com` and `b.example.com` share a
 * budget. Not a public-suffix implementation - the last two labels are close
 * enough to stop the obvious way of side-stepping a per-host limit.
 */
export function targetKey(rawUrl: string): string | null {
  try {
    const host = new URL(
      /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    ).hostname;
    return host.split('.').slice(-2).join('.').toLowerCase();
  } catch {
    return null;
  }
}
