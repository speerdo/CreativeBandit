/*
 * The AI crawlers we check for, and what blocking each one actually costs.
 * See docs/creative-bandit-ai-readiness-scan.md §3.1.
 *
 * The `consequence` strings end up in front of an agency owner, so they have
 * to be accurate. Two in particular are easy to get wrong:
 *
 *  - Google-Extended is NOT Googlebot. Blocking it does not affect search
 *    ranking. Implying otherwise loses an informed reader instantly.
 *  - Blocking CCBot or Bytespider is often deliberate. Report the fact,
 *    do not moralise.
 */

export interface AiAgent {
  /** The token as it appears in a robots.txt User-agent line. */
  token: string;
  operator: string;
  /** What blocking it costs the site, in the report's voice. */
  consequence: string;
  /**
   * Whether this one belongs in the headline finding. Blocking Bytespider is
   * usually a choice; blocking GPTBot usually is not.
   */
  headline: boolean;
  /** Full UA string, for the edge probe. */
  userAgent: string;
}

export const AI_AGENTS: AiAgent[] = [
  {
    token: 'GPTBot',
    operator: 'OpenAI',
    consequence: 'ChatGPT cannot use this site as a source.',
    headline: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  },
  {
    token: 'OAI-SearchBot',
    operator: 'OpenAI',
    consequence: 'The site is excluded from ChatGPT search results.',
    headline: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  },
  {
    token: 'ChatGPT-User',
    operator: 'OpenAI',
    consequence:
      'When a user asks ChatGPT to open this site directly, the fetch fails.',
    headline: true,
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  },
  {
    token: 'ClaudeBot',
    operator: 'Anthropic',
    consequence: 'Claude cannot use this site as a source.',
    headline: true,
    userAgent: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  },
  {
    token: 'Claude-User',
    operator: 'Anthropic',
    consequence: 'User-initiated fetches from inside Claude fail.',
    headline: true,
    userAgent: 'Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  },
  {
    token: 'Claude-SearchBot',
    operator: 'Anthropic',
    consequence: 'The site is excluded from Claude search results.',
    headline: true,
    userAgent:
      'Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)',
  },
  {
    token: 'PerplexityBot',
    operator: 'Perplexity',
    consequence: 'Perplexity cannot cite this site in answers.',
    headline: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot',
  },
  {
    token: 'Google-Extended',
    operator: 'Google',
    // The nuance that keeps us credible.
    consequence:
      'Gemini cannot ground answers in this site. This does NOT affect Google Search ranking.',
    headline: true,
    // Google-Extended is a robots.txt token rather than a distinct UA, so the
    // edge probe cannot meaningfully test it. Handled in the probe.
    userAgent: '',
  },
  {
    token: 'Applebot-Extended',
    operator: 'Apple',
    consequence: 'Apple Intelligence cannot use this site.',
    headline: false,
    userAgent: '',
  },
  {
    token: 'meta-externalagent',
    operator: 'Meta',
    consequence: 'Meta AI cannot use this site.',
    headline: false,
    userAgent: 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  },
  {
    token: 'CCBot',
    operator: 'Common Crawl',
    consequence:
      'Common Crawl feeds many downstream training sets. Often blocked deliberately.',
    headline: false,
    userAgent: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  },
  {
    token: 'Bytespider',
    operator: 'ByteDance',
    consequence: 'Frequently blocked on purpose, and reasonable to leave blocked.',
    headline: false,
    userAgent: 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
  },
];

/** Agents that carry a real UA and can therefore be edge-probed. */
export const PROBEABLE_AGENTS = AI_AGENTS.filter((a) => a.userAgent !== '');

/**
 * UA emulation policy — see spec §3.1 and §9.
 *
 * Detecting UA-based edge blocking requires sending the bot's UA. Sending a
 * bare `GPTBot` string when we are not GPTBot is spoofing, so by default we
 * append our own identifier: most WAF rules match on the `GPTBot` substring,
 * so detection still fires, and anyone reading their access log can see who
 * actually called and why.
 *
 * `SCANNER_EXACT_UA=1` drops the suffix. That is the more accurate probe and
 * the less defensible one. It stays off until there is a human decision on
 * record.
 */
export function probeUserAgent(agent: AiAgent): string {
  const exact = process.env.SCANNER_EXACT_UA === '1';
  if (exact) return agent.userAgent;
  return `${agent.userAgent} CreativeBanditScanner/1.0 (+https://creativebandit.studio/scan)`;
}
