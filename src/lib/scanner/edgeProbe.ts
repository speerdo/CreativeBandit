import { safeFetch, type SafeResponse } from './safeFetch';
import { PROBEABLE_AGENTS, probeUserAgent, type AiAgent } from './agents';

/*
 * Edge-block detection.
 *
 * robots.txt is advisory; a CDN rule is enforcement, and it never appears in
 * robots.txt. Cloudflare's "Block AI Scrapers and Crawlers" is one toggle in
 * a dashboard, on by default for some plan tiers, and a scanner that only
 * parses robots.txt will hand a site owner a clean bill of health while every
 * AI crawler is being served a 403 at the edge.
 *
 * Method: fetch the same URL with an ordinary browser UA to establish a
 * control, then with each bot UA, and compare. See spec §3.1, half 2.
 */

const CONTROL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const PROBE_TIMEOUT_MS = 6000;

export type EdgeVerdict = 'ok' | 'blocked' | 'challenged' | 'error';

export interface EdgeProbeResult {
  agent: AiAgent;
  verdict: EdgeVerdict;
  status: number | null;
  /** Which signal produced the verdict, for the finding's evidence. */
  reason: string;
}

export interface EdgeProbeReport {
  control: { status: number; length: number } | null;
  results: EdgeProbeResult[];
  /** Agents blocked or challenged at the edge, headline ones first. */
  blocked: EdgeProbeResult[];
}

/** Cloudflare, Akamai and friends' interstitials, plus generic WAF wording. */
const CHALLENGE_MARKERS = [
  'just a moment',
  'checking your browser',
  'cf-browser-verification',
  'cf_chl_opt',
  '__cf_chl',
  'attention required',
  'ray id',
  'access denied',
  'you have been blocked',
  '请稍候',
  'incapsula',
  'perimeterx',
  'datadome',
];

function looksLikeChallenge(body: string): boolean {
  const head = body.slice(0, 4000).toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => head.includes(marker));
}

/**
 * A bot response is "blocked" if the status says so, or if the body is a
 * challenge page, or if it diverges wildly in size from the control while
 * the control was fine.
 */
function judge(control: SafeResponse, probe: SafeResponse): { verdict: EdgeVerdict; reason: string } {
  if (probe.status === 403) {
    return { verdict: 'blocked', reason: 'Returned 403 Forbidden to this crawler.' };
  }
  if (probe.status === 401) {
    return { verdict: 'blocked', reason: 'Returned 401 Unauthorized to this crawler.' };
  }
  if (probe.status === 429) {
    return { verdict: 'blocked', reason: 'Rate-limited (429) on a single request.' };
  }
  if (probe.status === 503 && control.status === 200) {
    return { verdict: 'challenged', reason: 'Served a 503 while a normal browser got 200.' };
  }

  if (looksLikeChallenge(probe.body) && !looksLikeChallenge(control.body)) {
    return {
      verdict: 'challenged',
      reason: 'Served a bot-challenge interstitial instead of the page.',
    };
  }

  if (control.status === 200 && probe.status === 200) {
    const controlLength = control.body.length;
    const probeLength = probe.body.length;
    // A challenge page is typically a fraction of the real page. Only judge
    // when the control is substantial enough for the ratio to mean anything.
    if (controlLength > 2000 && probeLength < controlLength * 0.25) {
      return {
        verdict: 'challenged',
        reason: `Served ${probeLength} bytes where a browser gets ${controlLength}.`,
      };
    }
  }

  if (probe.status >= 400) {
    return { verdict: 'blocked', reason: `Returned HTTP ${probe.status} to this crawler.` };
  }

  return { verdict: 'ok', reason: `HTTP ${probe.status}.` };
}

/**
 * Probe one URL with every AI bot UA we can meaningfully emulate.
 *
 * Deliberately small: the homepage plus, at most, one interior URL. This is a
 * diagnostic on a site the requester has attested they manage, not a crawl.
 */
export async function probeEdge(url: string): Promise<EdgeProbeReport> {
  let control: SafeResponse;
  try {
    control = await safeFetch(url, { userAgent: CONTROL_UA, timeoutMs: PROBE_TIMEOUT_MS });
  } catch {
    return { control: null, results: [], blocked: [] };
  }

  const settled = await Promise.allSettled(
    PROBEABLE_AGENTS.map(async (agent) => {
      const probe = await safeFetch(url, {
        userAgent: probeUserAgent(agent),
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      const { verdict, reason } = judge(control, probe);
      return { agent, verdict, status: probe.status, reason } satisfies EdgeProbeResult;
    })
  );

  const results: EdgeProbeResult[] = settled.map((outcome, i) =>
    outcome.status === 'fulfilled'
      ? outcome.value
      : {
          agent: PROBEABLE_AGENTS[i],
          verdict: 'error' as const,
          status: null,
          // A connection reset specifically for a bot UA is itself a signal,
          // but not one we can distinguish from an ordinary network blip.
          reason: 'The request failed outright.',
        }
  );

  const blocked = results
    .filter((r) => r.verdict === 'blocked' || r.verdict === 'challenged')
    .sort((a, b) => Number(b.agent.headline) - Number(a.agent.headline));

  return {
    control: { status: control.status, length: control.body.length },
    results,
    blocked,
  };
}
