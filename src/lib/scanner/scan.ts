import { validateTarget, safeFetch, BlockedUrlError, type SafeResponse } from './safeFetch';
import { checkCrawlers } from './checkCrawlers';
import { checkDelivery } from './checkDelivery';
import { sortFindings, type Finding, type ScanResult, type CheckId } from './types';

/** The site resolved but did not answer. Distinct from a blocked target. */
export class UnreachableSiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreachableSiteError';
  }
}

/*
 * Scan orchestrator.
 *
 * Phase 1 runs check 1 only. Per spec §8, that ships on its own: it is the
 * best finding, it fits in roughly ten seconds, and it proves the funnel
 * before we start paying for headless rendering.
 *
 * DEVIATION FROM SPEC §2.2, deliberate: the spec calls for a job queue with
 * polling, because the full five-check scan cannot fit in one request. With
 * only check 1 running, the whole thing completes well inside a normal
 * function timeout, so this is a plain synchronous request and there is no
 * job store or database yet. The job model becomes necessary in phase 2,
 * when the page-sampling checks land.
 */

export const SCAN_BUDGET_MS = 25_000;

/** Ordinary browser UA, matching the edge probe's control request. */
const CONTROL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Accept "example.com" as readily as a full URL — nobody types the scheme. */
export function normaliseInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new BlockedUrlError('Enter a URL to scan.');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed; // let validateTarget reject the scheme
  return `https://${trimmed}`;
}

export async function runScan(rawUrl: string): Promise<ScanResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  const target = await validateTarget(normaliseInput(rawUrl));

  /*
   * Reachability precheck.
   *
   * A domain can resolve perfectly and still not serve anything - a parked
   * domain, or DNS pointing somewhere the site no longer lives. Without this,
   * every fetch below fails independently and the scan spends its whole
   * budget timing out, then reports "No robots.txt" as an opportunity. That
   * reads as "your site is fine, just add a file" about a site that is not
   * responding at all, which is the worst possible failure mode for a tool
   * whose entire pitch is telling people something they did not know.
   */
  let control: SafeResponse;
  try {
    control = await safeFetch(target.url.href, { userAgent: CONTROL_UA, timeoutMs: 8000 });
  } catch {
    throw new UnreachableSiteError(
      `Could not reach ${target.url.hostname}. Check the address is right and the site is responding.`
    );
  }

  /*
   * A 5xx to an ordinary browser means the site is unhealthy, not that it is
   * doing something interesting to crawlers. Scanning on regardless produces
   * confident nonsense: an overloaded origin returns 503 to the bot probes
   * too, and the report announces "AI crawlers are blocked at the CDN" about
   * a site that is simply down. Bail instead.
   */
  if (control.status >= 500) {
    throw new UnreachableSiteError(
      `${target.url.hostname} returned HTTP ${control.status}. The site looks unhealthy right now, so a scan would not mean much. Try again shortly.`
    );
  }

  const findings: Finding[] = [];
  const incomplete: { check: CheckId; reason: string }[] = [];

  /*
   * A partial report is a success, not a failure (spec §5). A check that
   * throws or overruns costs its own findings and nothing else.
   */
  const budget = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('budget')), SCAN_BUDGET_MS)
  );

  const checks: { id: CheckId; run: () => Promise<Finding[]> }[] = [
    { id: 'crawlers', run: () => checkCrawlers(target.url.href, control) },
    { id: 'delivery', run: () => checkDelivery(target.url.href, control) },
  ];

  // Checks are independent, so run them together and let each fail alone.
  const settled = await Promise.allSettled(
    checks.map(({ run }) => Promise.race([run(), budget]))
  );

  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      findings.push(...outcome.value);
      return;
    }
    const error = outcome.reason;
    incomplete.push({
      check: checks[i].id,
      reason:
        error instanceof Error && error.message === 'budget'
          ? 'The site did not respond in time.'
          : 'The check could not complete.',
    });
  });

  const finished = Date.now();

  return {
    url: target.url.href,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    findings: sortFindings(findings),
    incomplete,
  };
}
