/*
 * Phase 5 validation harness. Spec §8, phase 5.
 *
 * NOT part of the test suite - it hits real third-party sites over the
 * network, so it is opt-in and named `.manual.ts` so vitest's default glob
 * skips it. Run it deliberately:
 *
 *   npx vitest run --config vitest.manual.config.ts
 *
 * It calls runScan() directly rather than going through /api/scan, which
 * bypasses the rate limiter (that limiter exists to stop exactly this kind
 * of batch coming from the outside) and removes HTTP overhead from the
 * timings.
 *
 * What it is for: measuring p50/p95 against the duration printed on the
 * homepage, and surfacing findings that are obviously wrong. Every false
 * positive found so far came from pointing this at a real site, not from
 * reading the code.
 */

export interface SiteUnderTest {
  url: string;
  /** What we expect, so an obviously wrong result stands out in the report. */
  note: string;
}

/*
 * A spread of platforms and sizes rather than a list of easy wins. Heavy
 * WordPress sites are over-represented on purpose: that is the audience, and
 * they are where the timing risk lives.
 */
export const SITES: SiteUnderTest[] = [
  { url: 'wpbeginner.com', note: 'WordPress, AIOSEO, apex->www, large' },
  { url: 'wordpress.org', note: 'WordPress, huge, hand-rolled sitemaps' },
  { url: 'woocommerce.com', note: 'WordPress commerce' },
  { url: 'yoast.com', note: 'WordPress, Yoast (their own plugin)' },
  { url: 'elementor.com', note: 'WordPress, Elementor page builder' },
  { url: 'kinsta.com', note: 'WordPress host, marketing site' },
  { url: 'wpengine.com', note: 'WordPress host, marketing site' },
  { url: 'astro.build', note: 'Astro, static, no JSON-LD' },
  { url: 'nextjs.org', note: 'Next.js' },
  { url: 'gatsbyjs.com', note: 'Gatsby' },
  { url: 'ghost.org', note: 'Ghost' },
  { url: 'basecamp.com', note: 'hand-rolled' },
  { url: 'stripe.com', note: 'large, hand-rolled, heavy JS' },
  { url: 'linear.app', note: 'client-rendered app marketing site' },
  { url: 'example.com', note: 'minimal control case' },
];

export interface SiteResult {
  url: string;
  note: string;
  ok: boolean;
  durationMs: number;
  findingCount: number;
  gaps: number;
  opportunities: number;
  good: number;
  incomplete: string[];
  /** Finding ids, so a suspicious combination is visible at a glance. */
  ids: string[];
  error?: string;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function summarise(results: SiteResult[]): string {
  const ok = results.filter((r) => r.ok);
  const durations = ok.map((r) => r.durationMs);

  const lines: string[] = [];
  lines.push('# Phase 5 validation run');
  lines.push('');
  lines.push(`Sites attempted: ${results.length}`);
  lines.push(`Completed:       ${ok.length}`);
  lines.push(`Failed:          ${results.length - ok.length}`);
  lines.push('');
  lines.push('## Timing (completed scans)');
  lines.push(`p50: ${percentile(durations, 50)}ms`);
  lines.push(`p95: ${percentile(durations, 95)}ms`);
  lines.push(`max: ${Math.max(0, ...durations)}ms`);
  lines.push('');
  lines.push('## Per site');
  lines.push('');
  lines.push('| site | ms | findings | gap/opp/good | incomplete | note |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const r of results) {
    if (!r.ok) {
      lines.push(`| ${r.url} | - | ERROR | - | - | ${r.error ?? ''} |`);
      continue;
    }
    lines.push(
      `| ${r.url} | ${r.durationMs} | ${r.findingCount} | ${r.gaps}/${r.opportunities}/${r.good} | ` +
        `${r.incomplete.join('; ') || '-'} | ${r.note} |`
    );
  }

  lines.push('');
  lines.push('## Findings by id (frequency)');
  lines.push('');
  const freq = new Map<string, number>();
  for (const r of ok) for (const id of r.ids) freq.set(id, (freq.get(id) ?? 0) + 1);
  for (const [id, count] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${id}: ${count}`);
  }

  /*
   * A finding that fires on nearly every site is either a real industry-wide
   * gap or a bug in our threshold. Worth eyeballing either way.
   */
  lines.push('');
  lines.push('## Fires on >80% of sites — verify these are real, not threshold bugs');
  lines.push('');
  for (const [id, count] of freq) {
    if (count / Math.max(ok.length, 1) > 0.8) lines.push(`- ${id} (${count}/${ok.length})`);
  }

  return lines.join('\n');
}
