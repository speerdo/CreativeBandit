/*
 * Finding shape for the AI readiness scan.
 * See docs/creative-bandit-ai-readiness-scan.md §4.
 */

export type FindingTag = 'gap' | 'opportunity' | 'good';

export type CheckId =
  | 'crawlers'
  | 'schema'
  | 'js-content'
  | 'llms-txt'
  | 'metadata'
  | 'delivery'
  | 'feeds';

export interface Finding {
  /** Stable slug, e.g. 'robots-ai-blocked'. */
  id: string;
  check: CheckId;
  tag: FindingTag;
  /** One line. Specific, numbers rather than adjectives. */
  title: string;
  /** One or two sentences on what it means for the reader. */
  detail: string;
  /** Never assert without showing the receipt. */
  evidence?: {
    quote?: string;
    source?: string;
  };
  affectedUrls?: string[];
  /** What to actually do about it. */
  remediation: string;
  /**
   * Display ordering only. Deliberately NOT summed into a score - the
   * homepage promises "specific findings, not a grade", and a number invites
   * arguing with the number instead of fixing the problem.
   */
  weight: number;
}

export interface ScanResult {
  url: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  findings: Finding[];
  /** Checks that could not complete, so the report can say so plainly. */
  incomplete: { check: CheckId; reason: string }[];
}

const TAG_ORDER: Record<FindingTag, number> = { gap: 0, opportunity: 1, good: 2 };

/** All gaps by weight, then opportunities, then good. Spec §4. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => TAG_ORDER[a.tag] - TAG_ORDER[b.tag] || b.weight - a.weight
  );
}
