import { describe, expect, it } from 'vitest';
import { caseStudies } from './caseStudies';

/** Every string in a case study, flattened, for the copy-wide checks. */
function allCopy(): string[] {
  return caseStudies.flatMap((c) => [
    c.title,
    c.shortTitle,
    c.categoryName,
    c.imageAlt,
    c.summary,
    c.problem,
    ...c.built,
    ...c.stack,
    ...(c.stats ?? []).flatMap((s) => [s.label, s.value]),
    c.lesson,
    c.metaTitle,
    c.metaDescription,
    c.about,
  ]);
}

describe('caseStudies', () => {
  it('has seven projects with unique slugs', () => {
    expect(caseStudies).toHaveLength(7);
    expect(new Set(caseStudies.map((c) => c.slug)).size).toBe(7);
  });

  it('does not collide with the motion page', () => {
    expect(caseStudies.map((c) => c.slug)).not.toContain('motion');
  });

  it('keeps meta descriptions between 140 and 160 characters', () => {
    for (const c of caseStudies) {
      expect(c.metaDescription.length, c.slug).toBeGreaterThanOrEqual(140);
      expect(c.metaDescription.length, c.slug).toBeLessThanOrEqual(160);
    }
  });

  it('titles follow "<Project> case study: <what it is>"', () => {
    for (const c of caseStudies) {
      expect(c.metaTitle, c.slug).toMatch(/^.+ case study: .+/);
    }
  });

  it('uses no em dashes or en dashes in copy', () => {
    for (const text of allCopy()) {
      expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`));
    }
  });

  it('has 3 to 5 built bullets and a non-empty stack', () => {
    for (const c of caseStudies) {
      expect(c.built.length, c.slug).toBeGreaterThanOrEqual(3);
      expect(c.built.length, c.slug).toBeLessThanOrEqual(5);
      expect(c.stack.length, c.slug).toBeGreaterThan(0);
    }
  });
});
