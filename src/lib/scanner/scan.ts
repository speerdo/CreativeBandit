import { validateTarget, safeFetch, BlockedUrlError, type SafeResponse } from './safeFetch';
import { checkCrawlers } from './checkCrawlers';
import { checkDelivery } from './checkDelivery';
import { checkFeeds } from './checkFeeds';
import { checkSchema } from './checkSchema';
import { checkLlmsTxt } from './checkLlmsTxt';
import { checkMetadata } from './checkMetadata';
import { fingerprintPlatform } from './platform';
import { parseRobots } from './robots';
import { discoverSitemap, sampleUrls, fetchPageSample } from './sitemap';
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
 * Phase 2 checks run in two waves, because half of them need page bodies
 * and half do not:
 *
 *   Wave 1 (no page bodies): crawlers, delivery, feeds, llms.txt  - fetch
 *          robots.txt, probe the edge, probe the soft-404 control, all
 *          against the homepage we already have.
 *   Wave 2 (page bodies):    sitemap discovery, sample, fetch ≤24 pages,
 *          then schema + metadata + images + identity parse the bodies
 *          in memory at zero marginal network cost.
 *
 * DEVIATION FROM SPEC §2.2, still deliberate: with six checks the whole
 * scan completes in roughly 25–35 seconds on a healthy WordPress site,
 * which fits inside a serverless timeout, so it is still a plain
 * synchronous request and there is still no job store. Streaming findings
 * land only if phase 3's headless renders push the total past a
 * comfortable wait.
 */

export const SCAN_BUDGET_MS = 45_000;
const WAVE1_BUDGET_MS = 15_000;

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
   * Reachability precheck (phase 1). A parked domain resolves fine and
   * answers nothing; without this, every subsequent fetch burned the
   * budget timing out and the report announced confident nonsense about a
   * site that was not responding at all.
   */
  let control: SafeResponse;
  try {
    control = await safeFetch(target.url.href, { userAgent: CONTROL_UA, timeoutMs: 8000 });
  } catch {
    throw new UnreachableSiteError(
      `Could not reach ${target.url.hostname}. Check the address is right and the site is responding.`
    );
  }

  if (control.status >= 500) {
    throw new UnreachableSiteError(
      `${target.url.hostname} returned HTTP ${control.status}. The site looks unhealthy right now, so a scan would not mean much. Try again shortly.`
    );
  }

  const origin = new URL(control.url).origin;
  const findings: Finding[] = [];
  const incomplete: { check: CheckId; reason: string }[] = [];

  /*
   * Platform fingerprint is free (homepage body is already downloaded)
   * and shapes everything downstream: sitemap candidate ordering,
   * remediation copy, page-builder hints. §3.10 says it never becomes a
   * finding of its own.
   */
  const platform = fingerprintPlatform(control);

  const collect = (
    check: CheckId,
    outcome: PromiseSettledResult<Finding[]>
  ): void => {
    if (outcome.status === 'fulfilled') {
      findings.push(...outcome.value);
      return;
    }
    const error = outcome.reason;
    incomplete.push({
      check,
      reason:
        error instanceof Error && error.message === 'budget'
          ? 'The site did not respond in time.'
          : 'The check could not complete.',
    });
  };

  // --- wave 1 --------------------------------------------------------------
  /*
   * crawlers/delivery are the phase-1 pair and must never be dropped.
   * feeds and llms.txt are cheap and independent, so run them alongside.
   * Their budget is capped separately so a slow soft-404 probe on llms.txt
   * cannot eat page-fetching time from wave 2.
   */
  const robotsFetch = safeFetch(`${origin}/robots.txt`, {
    accept: 'text/plain,*/*;q=0.8',
  }).catch(() => null);

  const robots = await (async () => {
    const response = await robotsFetch;
    return response?.status === 200 ? parseRobots(response.body) : { groups: [], sitemaps: [], absent: true };
  })();

  const wave1Budget = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('budget')), WAVE1_BUDGET_MS)
  );

  const wave1: { id: CheckId; run: () => Promise<Finding[]> }[] = [
    { id: 'crawlers', run: () => checkCrawlers(target.url.href, control) },
    { id: 'delivery', run: () => checkDelivery(target.url.href, control) },
    { id: 'feeds', run: () => Promise.resolve(checkFeeds(control, robots, platform)) },
    { id: 'llms-txt', run: () => checkLlmsTxt(origin) },
  ];

  const wave1Settled = await Promise.allSettled(
    wave1.map(({ run }) => Promise.race([run(), wave1Budget]))
  );
  wave1Settled.forEach((outcome, i) => collect(wave1[i].id, outcome));

  // --- wave 2 --------------------------------------------------------------
  /*
   * The remaining budget after wave 1. If wave 1 overran (a slow edge
   * probe, a hanging soft-404), wave 2 degrades gracefully - a shorter
   * page sample, then nothing at all - rather than blowing the total.
   */
  const elapsed = Date.now() - started;
  const wave2BudgetMs = Math.max(8_000, SCAN_BUDGET_MS - elapsed - 2_000);
  const wave2Budget = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('budget')), wave2BudgetMs)
  );

  const sitemap = await discoverSitemap(origin, robots, platform);
  const urls = sampleUrls(sitemap, control.body, origin);

  let pages: SafeResponse[] = [];
  try {
    pages = await Promise.race([fetchPageSample(urls), wave2Budget]);
  } catch {
    incomplete.push({
      check: 'schema',
      reason: 'The page sample did not complete before the budget ran out.',
    });
  }

  if (pages.length > 0) {
    /*
     * Schema and metadata both parse these bodies; schema's identity data
     * (org name) feeds metadata's §3.9 consistency check, so schema runs
     * first even though the two are otherwise independent.
     */
    let schemaResult;
    try {
      schemaResult = checkSchema(pages, sitemap, platform, origin);
      findings.push(...schemaResult.findings);
    } catch {
      incomplete.push({ check: 'schema', reason: 'The check could not complete.' });
      schemaResult = undefined;
    }

    try {
      const metaFindings = checkMetadata(pages, {
        schema: schemaResult ?? { findings: [], orgName: null, orgUrls: [] },
        platform,
        origin,
      });
      findings.push(...metaFindings);
    } catch {
      incomplete.push({ check: 'metadata', reason: 'The check could not complete.' });
    }
  } else if (!incomplete.some((i) => i.check === 'schema')) {
    // No pages at all: both downstream checks are incomplete for the same reason.
    incomplete.push(
      { check: 'schema', reason: 'No sampled pages were reachable.' },
      { check: 'metadata', reason: 'No sampled pages were reachable.' }
    );
  }

  const finished = Date.now();

  return {
    // The URL actually scanned, after redirects - not what was typed. Apex to
    // www is near universal on WordPress, and reporting the input captions the
    // results with a host we never examined.
    url: control.url,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    findings: sortFindings(findings),
    incomplete,
  };
}
