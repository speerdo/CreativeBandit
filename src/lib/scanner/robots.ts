/*
 * robots.txt parser implementing the group and precedence rules from
 * RFC 9309, rather than searching the file for a bot name.
 *
 * The distinction matters: `Disallow: /` under `User-agent: *` does not
 * apply to GPTBot if GPTBot has a group of its own, and a substring search
 * would report the opposite. Getting this backwards means telling an agency
 * owner their site is blocked when it is not.
 *
 * See docs/creative-bandit-ai-readiness-scan.md §3.1.
 */

export interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
  /** 1-based line number, so findings can quote the source. */
  line: number;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay?: number;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** True when the fetch produced something that is not a robots.txt at all. */
  absent: boolean;
}

export const EMPTY_ROBOTS: ParsedRobots = { groups: [], sitemaps: [], absent: true };

/**
 * A robots.txt that is actually the themed 404 page. Very common on
 * WordPress. Treated as "no robots.txt", not as a file with strange rules.
 */
export function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 1000).toLowerCase().trimStart();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<head>');
}

export function parseRobots(body: string): ParsedRobots {
  if (looksLikeHtml(body)) return { ...EMPTY_ROBOTS };

  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let current: RobotsGroup | null = null;
  // A run of consecutive User-agent lines names several agents for ONE group.
  let collectingAgents = false;

  const lines = body.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const withoutComment = raw.split('#')[0];
    const trimmed = withoutComment.trim();
    if (!trimmed) continue;

    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;

    const field = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();

    switch (field) {
      case 'user-agent': {
        if (!value) break;
        if (!collectingAgents || !current) {
          current = { agents: [], rules: [] };
          groups.push(current);
          collectingAgents = true;
        }
        current.agents.push(value.toLowerCase());
        break;
      }

      case 'allow':
      case 'disallow': {
        if (!current) {
          // Rules before any User-agent line are not addressed to anyone.
          break;
        }
        collectingAgents = false;
        current.rules.push({
          type: field === 'allow' ? 'allow' : 'disallow',
          path: value,
          line: i + 1,
        });
        break;
      }

      case 'crawl-delay': {
        if (!current) break;
        collectingAgents = false;
        const delay = Number(value);
        if (Number.isFinite(delay) && delay >= 0) current.crawlDelay = delay;
        break;
      }

      case 'sitemap': {
        // Sitemap is global, not part of any group.
        if (value) sitemaps.push(value);
        break;
      }

      default:
        break;
    }
  }

  return { groups, sitemaps, absent: false };
}

/**
 * The group that applies to a given agent.
 *
 * A crawler obeys the MOST SPECIFIC matching group only. Matching is
 * case-insensitive on a prefix of the product token, so `ChatGPT-User`
 * matches a group declared as `chatgpt-user` and, per the RFC's prefix rule,
 * a group declared as `chatgpt`. The `*` group applies only when nothing
 * else matches at all.
 */
export function groupFor(robots: ParsedRobots, agentToken: string): RobotsGroup | null {
  const token = agentToken.toLowerCase();

  let best: RobotsGroup | null = null;
  let bestLength = -1;

  for (const group of robots.groups) {
    for (const declared of group.agents) {
      if (declared === '*') continue;
      // Prefix match in either direction: a group for `claudebot` covers
      // `claudebot`, and a group for `claude` covers `claude-user`.
      const matches = token.startsWith(declared) || declared.startsWith(token);
      if (matches && declared.length > bestLength) {
        best = group;
        bestLength = declared.length;
      }
    }
  }

  if (best) return best;

  for (const group of robots.groups) {
    if (group.agents.includes('*')) return group;
  }

  return null;
}

export interface AccessVerdict {
  allowed: boolean;
  /** The rule that decided it, for the report's evidence field. */
  rule?: RobotsRule;
  /** Which group matched: the agent's own, or the wildcard. */
  via: 'agent' | 'wildcard' | 'default';
}

/**
 * Whether an agent may fetch a path.
 *
 * Precedence within a group is longest matching path wins, with Allow
 * beating Disallow on an equal-length tie. An empty `Disallow:` means
 * "nothing is disallowed" and is a common way to grant full access.
 */
export function isAllowed(
  robots: ParsedRobots,
  agentToken: string,
  path: string
): AccessVerdict {
  if (robots.absent || robots.groups.length === 0) {
    return { allowed: true, via: 'default' };
  }

  const group = groupFor(robots, agentToken);
  if (!group) return { allowed: true, via: 'default' };

  const via: AccessVerdict['via'] = group.agents.includes(agentToken.toLowerCase())
    ? 'agent'
    : group.agents.includes('*')
      ? 'wildcard'
      : 'agent';

  let winner: RobotsRule | undefined;
  let winnerLength = -1;

  for (const rule of group.rules) {
    // `Disallow:` with an empty value allows everything; it never matches.
    if (rule.path === '') continue;
    if (!pathMatches(rule.path, path)) continue;

    const length = rule.path.length;
    if (
      length > winnerLength ||
      (length === winnerLength && rule.type === 'allow' && winner?.type === 'disallow')
    ) {
      winner = rule;
      winnerLength = length;
    }
  }

  if (!winner) return { allowed: true, rule: undefined, via };
  return { allowed: winner.type === 'allow', rule: winner, via };
}

/**
 * robots.txt path matching, including the `*` wildcard and the `$`
 * end-anchor. Built as a regex rather than a manual scan because the
 * wildcard rules are exactly regex semantics with everything else escaped.
 */
function pathMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const escaped = body
    .split('*')
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  const source = anchored ? `^${escaped}$` : `^${escaped}`;

  try {
    return new RegExp(source).test(path);
  } catch {
    return false;
  }
}

/** Does this group shut the whole site, i.e. `Disallow: /` with no escape? */
export function blocksEverything(group: RobotsGroup): boolean {
  const verdictRoot = group.rules.some((r) => r.type === 'disallow' && r.path === '/');
  if (!verdictRoot) return false;
  // An Allow that reopens part of the site means it is not a blanket block.
  return !group.rules.some((r) => r.type === 'allow' && r.path.startsWith('/'));
}
