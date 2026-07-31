import { safeFetch } from './safeFetch';
import { parseRobots, isAllowed, type ParsedRobots } from './robots';
import { AI_AGENTS } from './agents';
import { probeEdge } from './edgeProbe';
import type { Finding } from './types';

/*
 * Check 1 — AI crawler blocking. Spec §3.1.
 *
 * The headline finding of the whole product: binary, objectively verifiable,
 * and frequently true of a site whose owner has no idea.
 *
 * Two independent mechanisms, and they need reporting separately because the
 * remediation is completely different - one is a text file, the other is a
 * dashboard toggle at a company the agency may not even realise is in the
 * request path.
 */

function list(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export async function checkCrawlers(siteUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const origin = new URL(siteUrl).origin;

  // --- half 1: robots.txt -------------------------------------------------
  let robots: ParsedRobots = { groups: [], sitemaps: [], absent: true };
  let robotsSource = `${origin}/robots.txt`;

  try {
    const response = await safeFetch(robotsSource, { accept: 'text/plain,*/*;q=0.8' });
    if (response.status === 200) {
      robots = parseRobots(response.body);
    }
  } catch {
    // Unreachable robots.txt is treated as absent, which is the permissive
    // reading and the same conclusion a crawler would draw.
  }

  const blockedInRobots = AI_AGENTS.map((agent) => ({
    agent,
    verdict: isAllowed(robots, agent.token, '/'),
  })).filter((entry) => !entry.verdict.allowed);

  if (blockedInRobots.length > 0) {
    const headline = blockedInRobots.filter((e) => e.agent.headline);
    const shown = headline.length > 0 ? headline : blockedInRobots;
    const names = shown.map((e) => e.agent.token);
    const example = shown[0];

    findings.push({
      id: 'robots-ai-blocked',
      check: 'crawlers',
      tag: 'gap',
      title: `${list(names)} ${names.length === 1 ? 'is' : 'are'} blocked in robots.txt`,
      detail:
        `${shown.map((e) => e.agent.consequence).slice(0, 2).join(' ')} ` +
        // Hedged on purpose. On an agency-managed site this is nearly always
        // an SEO plugin default, but plenty of publishers block these
        // deliberately, and telling one of those that nobody decided it is
        // how we lose the room.
        'On most agency-managed sites this is a plugin default rather than a decision anyone made.',
      evidence: {
        quote: example.verdict.rule
          ? `line ${example.verdict.rule.line}: ${example.verdict.rule.type === 'disallow' ? 'Disallow' : 'Allow'}: ${example.verdict.rule.path}`
          : undefined,
        source: robotsSource,
      },
      remediation:
        'Remove or narrow the Disallow rules for these agents in robots.txt. If an SEO plugin ' +
        'generates the file, the setting will be in the plugin rather than in a file you can edit directly.',
      weight: 100,
    });
  }

  // --- half 2: the edge ---------------------------------------------------
  const edge = await probeEdge(origin);

  if (edge.blocked.length > 0) {
    const names = edge.blocked.map((r) => r.agent.token);
    const first = edge.blocked[0];

    /*
     * The most valuable sentence in the product is the one that explains why
     * this is invisible: their robots.txt looks fine, so nothing they can
     * inspect on their own server shows the block.
     */
    const invisible = blockedInRobots.length === 0;

    findings.push({
      id: 'edge-ai-blocked',
      check: 'crawlers',
      tag: 'gap',
      title: `AI crawlers are blocked at the CDN, not in robots.txt`,
      detail: invisible
        ? `${list(names)} ${names.length === 1 ? 'is' : 'are'} being refused by the CDN or firewall in front of this site. ` +
          'The robots.txt file looks clean, which is exactly why this is easy to miss.'
        : `${list(names)} ${names.length === 1 ? 'is' : 'are'} also refused at the CDN, so fixing robots.txt alone will not restore access.`,
      evidence: {
        quote: `${first.agent.token}: ${first.reason}`,
        source: origin,
      },
      remediation:
        'Check the CDN or WAF in front of the site. In Cloudflare this is the "Block AI Scrapers and ' +
        'Crawlers" toggle under Security > Bots, which is enabled by default on some plans. Other ' +
        'providers ship equivalent managed rules.',
      weight: 110, // outranks the robots.txt finding: harder to find, same impact
    });
  }

  // --- the good news ------------------------------------------------------
  if (blockedInRobots.length === 0 && edge.blocked.length === 0 && edge.control) {
    findings.push({
      id: 'crawlers-clear',
      check: 'crawlers',
      tag: 'good',
      title: 'All major AI crawlers can reach this site',
      detail:
        'Nothing in robots.txt or at the CDN is turning away GPTBot, ClaudeBot, PerplexityBot or ' +
        'Google-Extended. Assistants can fetch these pages.',
      evidence: { source: robotsSource },
      remediation: 'No action needed. Worth re-checking after any CDN or SEO plugin change.',
      weight: 40,
    });
  }

  // Deliberate blocks are reported without judgement — see agents.ts.
  const deliberate = blockedInRobots.filter((e) => !e.agent.headline);
  if (deliberate.length > 0 && blockedInRobots.length > deliberate.length) {
    findings.push({
      id: 'robots-deliberate-blocks',
      check: 'crawlers',
      tag: 'good',
      title: `${list(deliberate.map((e) => e.agent.token))} blocked, which is often deliberate`,
      detail:
        'These are commonly blocked on purpose and are a reasonable choice to leave in place. ' +
        'Noted so the list above is complete, not as something to fix.',
      evidence: { source: robotsSource },
      remediation: 'No action needed unless the block was unintentional.',
      weight: 10,
    });
  }

  if (robots.absent) {
    findings.push({
      id: 'robots-missing',
      check: 'crawlers',
      tag: 'opportunity',
      title: 'No robots.txt',
      detail:
        'Nothing is blocked, so crawlers can reach everything. A robots.txt is also where the ' +
        'sitemap is usually advertised, which is how most crawlers find it.',
      evidence: { source: robotsSource },
      remediation:
        'Add a robots.txt with a Sitemap: line. An SEO plugin will generate one automatically.',
      weight: 30,
    });
  }

  return findings;
}
