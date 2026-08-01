import type { SafeResponse } from './safeFetch';
import type { PlatformFingerprint } from './platform';
import type { SampledSitemap } from './sitemap';
import type { Finding } from './types';

/*
 * Check 2 — structured data coverage. Spec §3.2.
 *
 * The insight that justifies its existence: Yoast and RankMath emit
 * WebSite/WebPage/Organization/BreadcrumbList on every page, so a naive
 * "percentage of pages with schema" metric reports 100% on a typical
 * WordPress site and tells the reader nothing. The gap between that 100%
 * and "6% carry entity schema" is the actual finding, and it is the kind
 * of distinction that signals we know the platform.
 */

/** Plugin defaults; near-zero marginal value (spec §3.2). */
export const BOILERPLATE_TYPES = new Set([
  'website',
  'webpage',
  'organization',
  'breadcrumblist',
  'searchaction',
  'potentialaction',
  'sitenavigationelement',
]);

/** What actually lets an assistant answer a question about the business. */
export const ENTITY_TYPES = new Set([
  'product',
  'service',
  'article',
  'faqpage',
  'howto',
  'localbusiness',
  'event',
  'jobposting',
  'recipe',
  'review',
  'person',
]);

/** Sanity checks for the entity types we validate in detail. */
const REQUIRED_PROPS: Record<string, string[]> = {
  product: ['name'],
  localbusiness: ['name'],
  service: ['name', 'provider'],
};

interface PageSchemaProfile {
  url: string;
  types: Set<string>;
  entityTypes: Set<string>;
  malformedJsonLd: boolean;
  /** Product/LocalBusiness nodes missing required properties. */
  incomplete: { type: string; missing: string[] }[];
}

export interface SchemaCheckResult {
  findings: Finding[];
  /** For §3.9: the org name the schema claims, if any. */
  orgName: string | null;
  orgUrls: string[];
}

export function checkSchema(
  pages: SafeResponse[],
  sitemap: SampledSitemap,
  platform: PlatformFingerprint,
  origin: string
): SchemaCheckResult {
  const findings: Finding[] = [];
  const profiles = pages.map(analysePage);

  const withBoilerplate = profiles.filter((p) => p.types.size > 0).length;
  const entityPages = profiles.filter((p) => p.entityTypes.size > 0);
  const withEntity = entityPages.length;
  const malformedPages = profiles.filter((p) => p.malformedJsonLd);
  const incompletePages = profiles.filter((p) => p.incomplete.length > 0);

  const sampleSize = profiles.length;

  const orgName = profiles
    .flatMap((p) => orgNamesFromPage(pages.find((pg) => pg.url === p.url)?.body ?? ''))
    .find(Boolean) ?? null;
  const orgUrls = profiles
    .filter((p) => orgNamesFromPage(pages.find((pg) => pg.url === p.url)?.body ?? '').length > 0)
    .map((p) => p.url);

  if (sitemap.sitemapMissing && sitemap.source === 'none') {
    findings.push({
      id: 'schema-no-sitemap',
      check: 'schema',
      tag: 'gap',
      title: 'No sitemap exists',
      detail:
        'Crawlers have to find pages by following links, which is slower and less reliable ' +
        'than reading a list. Most assistants will only ever see the homepage.',
      evidence: { source: `${origin}/sitemap.xml` },
      remediation: platform.isWordPress
        ? 'Any SEO plugin (Yoast, RankMath) generates one automatically; WordPress core also ' +
          'ships /wp-sitemap.xml since 5.5.'
        : 'Generate a sitemap and reference it from robots.txt with a Sitemap: line.',
      weight: 65,
    });
  }

  if (withEntity === 0 && sampleSize > 0) {
    const boilerplateNote =
      withBoilerplate > 0
        ? `${withBoilerplate} of the ${sampleSize} sampled pages carry schema, but all of it is ` +
          'plugin boilerplate (WebSite, WebPage, BreadcrumbList) rather than anything that ' +
          'describes the business.'
        : sampleSize === 1
          ? 'The homepage carries no structured data at all.'
          : `None of the ${sampleSize} sampled pages carry any structured data at all.`;

    findings.push({
      id: 'schema-no-entity',
      check: 'schema',
      tag: withBoilerplate > 0 ? 'opportunity' : 'gap',
      title:
        withBoilerplate > 0
          ? 'Every page carries plugin boilerplate, but nothing describes what the business does'
          : `No structured data on ${sampleSize === 1 ? 'the homepage' : `the ${sampleSize} pages sampled`}`,
      detail:
        `${boilerplateNote} An assistant answering "what does this company sell" has no markup ` +
        'to anchor to, so it falls back to reading prose and guessing.',
      evidence: { source: profiles[0]?.url ?? `${origin}/` },
      remediation:
        'Add Service schema to each service page and LocalBusiness schema to the homepage. ' +
        'On WordPress, Yoast and RankMath both have knowledge-graph settings that generate ' +
        'most of this from fields you have probably already filled in.',
      weight: 80,
    });
  } else if (withEntity > 0) {
    // The tier gap is the finding: how much of the sample has real markup.
    const thin = sampleSize - withEntity;
    if (thin / sampleSize >= 0.7 && sampleSize >= 8) {
      const types = [...new Set(entityPages.flatMap((p) => [...p.entityTypes]))].slice(0, 3);
      findings.push({
        id: 'schema-thin-entity',
        check: 'schema',
        tag: 'opportunity',
        title: `Only ${withEntity} of ${sampleSize} sampled pages carry entity schema`,
        detail:
          `The rest carry at most plugin boilerplate. ${types.join(', ') || 'Entity'} markup is ` +
          'what lets an assistant answer a question about the business with any confidence; ' +
          'the other pages are prose it has to guess from.',
        evidence: {
          quote: types.map((t) => `${t} present`).join(' · ') || undefined,
          source: entityPages[0]?.url,
        },
        affectedUrls: profiles.filter((p) => p.entityTypes.size === 0).map((p) => p.url).slice(0, 10),
        remediation:
          'Identify the pages a prospective client would actually land on - services, case ' +
          'studies, about - and make sure each carries the schema type that describes it.',
        weight: 60,
      });
    }
  }

  if (malformedPages.length > 0) {
    findings.push({
      id: 'schema-broken-json-ld',
      check: 'schema',
      tag: 'gap',
      title: `${malformedPages.length} of ${sampleSize} sampled pages carry malformed JSON-LD`,
      detail:
        'A plugin is emitting structured data that fails to parse, so an assistant reading the ' +
        'page sees no schema at all on those pages. Usually caused by a quote or ampersand in ' +
        'a plugin field.',
      evidence: { source: malformedPages[0].url },
      affectedUrls: malformedPages.map((p) => p.url).slice(0, 10),
      remediation:
        'View-source one of the listed pages and search for application/ld+json. The broken ' +
        'block will be visible; work backwards from it to the plugin or theme field that ' +
        'produced it.',
      weight: 75,
    });
  }

  if (incompletePages.length > 0) {
    const first = incompletePages[0].incomplete[0];
    findings.push({
      id: 'schema-incomplete-entity',
      check: 'schema',
      tag: 'gap',
      title: `Entity schema is present but incomplete on ${incompletePages.length} of ${sampleSize} sampled pages`,
      detail:
        `A ${first.type} without ${first.missing.join(' or ')} is present-but-useless - an ` +
        'assistant finds the markup and cannot say what the business actually offers.',
      evidence: {
        quote: `${first.type}: missing ${first.missing.join(', ')}`,
        source: incompletePages[0].url,
      },
      affectedUrls: incompletePages.map((p) => p.url).slice(0, 10),
      remediation:
        'Fill the missing fields. If the schema comes from a plugin, check the plugin\'s ' +
        'per-type settings - a partially-filled "Organization" tab is the usual cause.',
      weight: 70,
    });
  }

  if (
    findings.filter((f) => f.tag === 'gap' || f.tag === 'opportunity').length === 0 &&
    sampleSize > 0
  ) {
    findings.push({
      id: 'schema-good',
      check: 'schema',
      tag: 'good',
      title: 'Structured data is in genuinely good shape',
      detail: 'The sampled pages carry schema that describes the business, not just plugin defaults.',
      evidence: { source: `${origin}/` },
      remediation: 'No action needed.',
      weight: 25,
    });
  }

  return { findings, orgName, orgUrls };
}

/** Profile one page's structured data. Never throws. */
function analysePage(page: SafeResponse): PageSchemaProfile {
  const profile: PageSchemaProfile = {
    url: page.url,
    types: new Set(),
    entityTypes: new Set(),
    malformedJsonLd: false,
    incomplete: [],
  };

  // JSON-LD blocks, including @graph.
  for (const block of page.body.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi) ?? []) {
    const json = block.match(/>([\s\S]*?)<\/script\s*>/i)?.[1];
    if (!json) continue;
    try {
      const parsed: unknown = JSON.parse(json);
      walkJsonLd(parsed, profile);
    } catch {
      profile.malformedJsonLd = true;
    }
  }

  // Microdata: itemtype attributes.
  for (const itemtype of page.body.match(/\bitemtype\s*=\s*["']([^"']+)["']/gi) ?? []) {
    const value = itemtype.match(/\bitemtype\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
    const type = value.split('/').pop()?.toLowerCase() ?? '';
    if (type) {
      profile.types.add(type);
      if (ENTITY_TYPES.has(type)) profile.entityTypes.add(type);
    }
  }

  // Validate required properties for the entity types we know about.
  for (const node of collectJsonLdNodes(page.body)) {
    const type = typeof node['@type'] === 'string' ? node['@type'].toLowerCase() : null;
    if (!type || !REQUIRED_PROPS[type]) continue;
    const missing = REQUIRED_PROPS[type].filter((prop) => !(prop in node));
    if (missing.length === REQUIRED_PROPS[type].length) {
      profile.incomplete.push({ type: node['@type'] as string, missing });
    }
  }

  return profile;
}

type JsonLdNode = Record<string, unknown>;

function walkJsonLd(data: unknown, profile: PageSchemaProfile, depth = 0): void {
  if (depth > 6 || data == null || typeof data !== 'object') return;

  if (Array.isArray(data)) {
    for (const item of data) walkJsonLd(item, profile, depth + 1);
    return;
  }

  const node = data as JsonLdNode;
  const rawType = node['@type'];
  const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];

  for (const t of types) {
    if (typeof t !== 'string') continue;
    const type = t.toLowerCase();
    profile.types.add(type);
    if (ENTITY_TYPES.has(type)) profile.entityTypes.add(type);
  }

  if (node['@graph']) walkJsonLd(node['@graph'], profile, depth + 1);
}

/**
 * Organisation names claimed by schema, for §3.9's identity check. Only
 * reads Organization/LocalBusiness nodes; anything else claiming a name is
 * not what we are looking for.
 */
export function orgNamesFromPage(body: string): string[] {
  const names: string[] = [];
  for (const block of body.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi) ?? []) {
    const json = block.match(/>([\s\S]*?)<\/script\s*>/i)?.[1];
    if (!json) continue;
    try {
      collectOrgNames(JSON.parse(json), names, 0);
    } catch {
      continue;
    }
  }
  return names;
}

function collectOrgNames(data: unknown, out: string[], depth: number): void {
  if (depth > 6 || data == null || typeof data !== 'object') return;
  if (Array.isArray(data)) {
    for (const item of data) collectOrgNames(item, out, depth + 1);
    return;
  }
  const node = data as JsonLdNode;
  const rawType = node['@type'];
  const types = (Array.isArray(rawType) ? rawType : rawType ? [rawType] : []).map((t) =>
    typeof t === 'string' ? t.toLowerCase() : ''
  );
  if (types.includes('organization') || types.includes('localbusiness')) {
    if (typeof node.name === 'string' && node.name.trim()) out.push(node.name.trim());
  }
  if (node['@graph']) collectOrgNames(node['@graph'], out, depth + 1);
}

function collectJsonLdNodes(body: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const block of body.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi) ?? []) {
    const json = block.match(/>([\s\S]*?)<\/script\s*>/i)?.[1];
    if (!json) continue;
    try {
      flattenJsonLd(JSON.parse(json), nodes, 0);
    } catch {
      continue;
    }
  }
  return nodes;
}

function flattenJsonLd(data: unknown, out: JsonLdNode[], depth: number): void {
  if (depth > 6 || data == null || typeof data !== 'object') return;
  if (Array.isArray(data)) {
    for (const item of data) flattenJsonLd(item, out, depth + 1);
    return;
  }
  const node = data as JsonLdNode;
  out.push(node);
  if (node['@graph']) flattenJsonLd(node['@graph'], out, depth + 1);
}
