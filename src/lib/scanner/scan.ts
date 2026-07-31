import { validateTarget, safeFetch, BlockedUrlError } from './safeFetch';
import { checkCrawlers } from './checkCrawlers';
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
  try {
    await safeFetch(target.url.href, { userAgent: CONTROL_UA, timeoutMs: 8000 });
  } catch {
    throw new UnreachableSiteError(
      `Could not reach ${target.url.hostname}. Check the address is right and the site is responding.`
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

  try {
    const crawlerFindings = await Promise.race([checkCrawlers(target.url.href), budget]);
    findings.push(...crawlerFindings);
  } catch (error) {
    incomplete.push({
      check: 'crawlers',
      reason:
        error instanceof Error && error.message === 'budget'
          ? 'The site did not respond in time.'
          : 'The check could not complete.',
    });
  }

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
