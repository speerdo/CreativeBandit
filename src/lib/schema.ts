/*
 * JSON-LD building blocks.
 *
 * Shaped by the same rule our own scanner applies in checkSchema.ts: an
 * Organization/WebSite/BreadcrumbList node is boilerplate that every SEO
 * plugin emits, and a page carrying only boilerplate reads as "no structured
 * data" to an assistant trying to answer a question about the business. What
 * counts is an *entity* node — Service, Article, Person, LocalBusiness — that
 * says what the page is actually about.
 *
 * Two mechanical constraints, both worth knowing before editing:
 *
 *  1. Entity nodes must sit at the top level of the @graph. A parser that
 *     walks @graph and arrays (ours does, and it is not unusual) will never
 *     see a Person nested under `founder`.
 *  2. Service nodes need both `name` and `provider`; LocalBusiness needs
 *     `name`. Half-filled entity markup is worse than none, because it looks
 *     answerable and is not.
 */

export const SITE = 'https://creativebandit.studio';

/** Stable @id so page-level nodes can reference the org without repeating it. */
export const ORG_ID = `${SITE}/#organization`;

export type SchemaNode = Record<string, unknown>;

/**
 * The global node, emitted on every page. Boilerplate by the definition
 * above, and still required: it is what tells an assistant which business
 * the site belongs to, and it anchors every `provider` reference below.
 */
export const organization: SchemaNode = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Creative Bandit',
  legalName: 'Creative Bandit, LLC',
  description:
    'A two-person studio pairing full-stack development and AI automation with design and motion.',
  url: SITE,
  logo: `${SITE}/mascot/bandit-cat.svg`,
  image: `${SITE}/og-image.png`,
  foundingDate: '2026',
  email: 'hello@creativebandit.studio',
  telephone: '+1-317-660-5295',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Indianapolis',
    addressRegion: 'IN',
    addressCountry: 'US',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'Customer Service',
    email: 'hello@creativebandit.studio',
    telephone: '+1-317-660-5295',
    url: `${SITE}/contact`,
  },
  sameAs: ['https://github.com/speerdo'],
};

/**
 * The studio as a place of business. Only for pages where that framing is
 * the point — the homepage and contact — rather than on every page, which
 * would be stuffing.
 */
export function localBusiness(url: string): SchemaNode {
  return {
    /*
     * Both types, not just the specific one. ProfessionalService is the
     * accurate subtype, LocalBusiness is what most consumers actually match
     * against — including our own scanner, which compares @type against a
     * fixed list and would read a bare ProfessionalService as boilerplate.
     */
    '@type': ['ProfessionalService', 'LocalBusiness'],
    '@id': `${SITE}/#localbusiness`,
    name: 'Creative Bandit',
    description:
      'White-label web development, AI automation, and design and motion for agencies, ' +
      'from a two-person studio in Indianapolis.',
    url,
    telephone: '+1-317-660-5295',
    email: 'hello@creativebandit.studio',
    priceRange: '$$',
    address: organization.address,
    areaServed: {
      '@type': 'Country',
      name: 'United States',
    },
    parentOrganization: { '@id': ORG_ID },
  };
}

export interface ServiceInput {
  name: string;
  description: string;
  url: string;
  /** schema.org category string, e.g. "Web Development". */
  category?: string;
}

/** A single offering. `provider` is required — see the note at the top. */
export function service({ name, description, url, category }: ServiceInput): SchemaNode {
  return {
    '@type': 'Service',
    name,
    description,
    url,
    provider: { '@id': ORG_ID },
    ...(category ? { serviceType: category } : {}),
    areaServed: { '@type': 'Country', name: 'United States' },
  };
}

export interface ArticleInput {
  title: string;
  description: string;
  url: string;
  /** ISO date. */
  datePublished: string;
  author: string;
  image?: string;
}

export function article({
  title,
  description,
  url,
  datePublished,
  author,
  image,
}: ArticleInput): SchemaNode {
  return {
    '@type': 'Article',
    headline: title,
    description,
    url,
    mainEntityOfPage: url,
    datePublished,
    author: { '@type': 'Person', name: author },
    publisher: { '@id': ORG_ID },
    ...(image ? { image: new URL(image, SITE).href } : {}),
  };
}

export interface PersonInput {
  name: string;
  jobTitle: string;
  description: string;
  image?: string;
  sameAs?: string[];
}

export function person({ name, jobTitle, description, image, sameAs }: PersonInput): SchemaNode {
  return {
    '@type': 'Person',
    name,
    jobTitle,
    description,
    worksFor: { '@id': ORG_ID },
    ...(image ? { image: new URL(image, SITE).href } : {}),
    ...(sameAs?.length ? { sameAs } : {}),
  };
}
