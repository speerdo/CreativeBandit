import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runScan } from './scan';
import { SITES, summarise, type SiteResult } from './validation.manual';

/*
 * Opt-in network run. See validation.manual.ts for why this is not in the
 * normal suite. Sites are scanned one at a time rather than in parallel, so
 * we are never running fifteen simultaneous scans across the internet.
 */
it(
  'phase 5 validation sweep',
  async () => {
    const results: SiteResult[] = [];

    for (const site of SITES) {
      try {
        const scan = await runScan(site.url);
        results.push({
          url: site.url,
          note: site.note,
          ok: true,
          durationMs: scan.durationMs,
          findingCount: scan.findings.length,
          gaps: scan.findings.filter((f) => f.tag === 'gap').length,
          opportunities: scan.findings.filter((f) => f.tag === 'opportunity').length,
          good: scan.findings.filter((f) => f.tag === 'good').length,
          incomplete: scan.incomplete.map((i) => `${i.check}: ${i.reason}`),
          ids: scan.findings.map((f) => f.id),
        });
      } catch (error) {
        results.push({
          url: site.url,
          note: site.note,
          ok: false,
          durationMs: 0,
          findingCount: 0,
          gaps: 0,
          opportunities: 0,
          good: 0,
          incomplete: [],
          ids: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const report = summarise(results);
    const out = process.env.VALIDATION_OUT ?? 'validation-report.md';
    writeFileSync(out, report);

    // The run itself is the deliverable; this only guards against a total
    // failure that would otherwise look like a clean pass.
    expect(results.some((r) => r.ok)).toBe(true);
  },
  15 * 60 * 1000
);
