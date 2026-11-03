/*
 * Case study data for the seven properties Creative Bandit owns. Client work
 * is deliberately absent: those cards on /work keep linking out.
 *
 * Rules for editing this file (from docs/content-case-studies-blog-spec.md):
 *
 *  - Every `stats` entry carries a source and a date in the comment above it.
 *    A number that cannot be sourced does not go in. Drop the stat, and drop
 *    the whole `stats` array if nothing is left.
 *  - Page counts are the number of <loc> entries in the live sitemap, counted
 *    2026-11-03 (HomeWaterPure, Invoice for Trades, RecycleOldTech, DowntownDry
 *    and Home Power Ready via sitemap-index.xml and each child sitemap;
 *    eBikeLocal and Yield to Freedom via a flat /sitemap.xml).
 *  - No em dashes, and no en dashes used as dashes. src/data/caseStudies.test.ts
 *    enforces it.
 *
 * Deliberately left out for lack of a source (see the hand-off on the PR):
 * DowntownDry's 97% accuracy and 90% review-time figures, Home Power Ready's
 * "167 pages" (the live sitemap counts 134), and any revenue or conversion
 * figure for any property.
 */

export interface CaseStudyStat {
  label: string;
  value: string;
}

export interface CaseStudy {
  /** URL segment under /work/. Must never be "motion", which is its own page. */
  slug: string;
  title: string;
  /** Same strings the cards on /work.astro use for their category line. */
  categoryName: string;
  /** Short name for the "More work" cards and breadcrumbs. */
  shortTitle: string;
  url: string;
  image: string;
  imageAlt: string;
  /** Intrinsic pixel size of the screenshot, so the browser can reserve the box. */
  imageWidth: number;
  imageHeight: number;
  /** One line under the H1 and in the "More work" card. */
  summary: string;
  problem: string;
  built: string[];
  stack: string[];
  stats?: CaseStudyStat[];
  lesson: string;
  /** `<Project> case study: <what it is>`, before the layout adds " | Creative Bandit". */
  metaTitle: string;
  /** 140 to 160 characters. */
  metaDescription: string;
  /** For the CreativeWork `about` field. */
  about: string;
}

export const caseStudies: CaseStudy[] = [
  {
    slug: 'homewaterpure',
    title: 'HomeWaterPure',
    shortTitle: 'HomeWaterPure',
    categoryName: 'Full-Stack Development / Data',
    url: 'https://homewaterpure.com',
    image: '/images/homewaterpure_desktop.webp',
    imageAlt: 'HomeWaterPure website screenshot',
    imageWidth: 1600,
    imageHeight: 900,
    summary:
      'A data-first guide to water softeners and filters, where every spec is sourced and dated and the sizing calculator shows its arithmetic.',
    problem:
      'Homeowners shopping for a water softener land on affiliate pages that repeat manufacturer claims and never say where a number came from. Hardness varies city by city, so a generic "best softener" list is a guess. We wanted a guide where a reader can check every figure.',
    built: [
      'A product catalog in Postgres where each spec and price carries a source and a checked-on date.',
      'City hardness pages built from each utility’s own Consumer Confidence Report, with the quoted line and URL logged for every row.',
      'A sizing calculator that runs in the browser and shows each step, from household size to grain capacity.',
      'A methodology page that says how products are chosen and how the site makes money.',
      'Affiliate links routed through our own redirect, which logs clicks without storing an IP address.',
    ],
    stack: ['Astro', 'Neon Postgres', 'Drizzle ORM', 'Vercel', 'MDX', 'Amazon Creators API'],
    stats: [
      /*
       * Pages: live sitemap, 37 <loc> entries, counted 2026-11-03.
       * Cities: scripts/data/cities.json in speerdo/home-water-pure, 18 rows,
       *   each verified against a utility document (docs/HARDNESS-SOURCES.md),
       *   file last committed 2026-10-13.
       * Products: scripts/data/products.json in the same repo, 37 entries,
       *   read 2026-11-03.
       */
      { label: 'Pages in sitemap', value: '37' },
      { label: 'Cities with sourced hardness', value: '18' },
      { label: 'Products in the catalog', value: '37' },
    ],
    lesson:
      'Put the source next to the number in the database, not in a footnote. Once every value has a "checked on" date, a stale spec becomes a query you can run instead of something you hope you remember.',
    metaTitle: 'HomeWaterPure case study: a sourced guide to water softeners',
    metaDescription:
      'How we built HomeWaterPure, a softener and filter guide on Astro and Neon Postgres where every spec is sourced and dated and the calculator shows its work.',
    about: 'A data-first guide to home water softeners and filters',
  },
  {
    slug: 'invoice-for-trades',
    title: 'Invoice for Trades',
    shortTitle: 'Invoice for Trades',
    categoryName: 'Web Application / SEO',
    url: 'https://invoicefortrades.com',
    image: '/images/invoicefortrades_desktop.webp',
    imageAlt: 'Invoice for Trades website screenshot',
    imageWidth: 1600,
    imageHeight: 900,
    summary:
      'A free invoice generator for tradespeople with no signup and no watermark. The PDF is built in the browser, so nothing is sent to a server.',
    problem:
      'Most free invoice tools ask for an account, stamp their logo on the PDF, or hold the invoice hostage behind a paywall. A plumber who needs to bill a job from a truck wants a form, a total and a file. That is all.',
    built: [
      'An invoice form built with Svelte 5 that keeps line items, tax and totals in sync as you type.',
      'PDF output generated in the browser with pdfmake, so there is no upload and nothing to sign up for.',
      'One landing page per trade, each with its own wording, sample line items and FAQ, driven by a JSON file per trade.',
      'A sample invoice component and social images generated at build time with Satori.',
      'Static pages on Vercel, with the Svelte generator loaded only on the pages that have the form.',
    ],
    stack: ['Astro', 'Svelte 5', 'Tailwind CSS v4', 'pdfmake', 'Satori', 'Vercel'],
    stats: [
      /*
       * Pages: live sitemap, 32 <loc> entries, counted 2026-11-03.
       * Trades: 27 JSON files in src/content/trades in speerdo/trade-invoices,
       *   counted 2026-11-03.
       */
      { label: 'Pages in sitemap', value: '32' },
      { label: 'Trade landing pages', value: '27' },
    ],
    lesson:
      'If the pitch is "no signup", make it true all the way down. Building the PDF in the browser means there is no server to run and no customer data to hold.',
    metaTitle: 'Invoice for Trades case study: a no-signup invoice generator',
    metaDescription:
      'How we built Invoice for Trades, a free invoice generator on Astro and Svelte 5 with browser-side PDFs, 27 trade landing pages, no signup and no watermark.',
    about: 'A free, no-signup invoice generator for tradespeople',
  },
  {
    slug: 'recycleoldtech',
    title: 'RecycleOldTech.com',
    shortTitle: 'RecycleOldTech',
    categoryName: 'E-commerce / SEO',
    url: 'https://recycleoldtech.com',
    image: '/images/recycleoldtech_desktop.webp',
    imageAlt: 'RecycleOldTech.com website screenshot',
    imageWidth: 1554,
    imageHeight: 1240,
    summary:
      'A nationwide directory of certified electronics recycling centers, with an automated content and SEO pipeline behind every city and state page.',
    problem:
      'People who want to recycle a laptop or a TV search by city, and the results are thin lists, dead links and centers that closed years ago. A useful directory has to cover thousands of places and stay current, which is too much to do by hand.',
    built: [
      'A discovery and classification pipeline that finds recycling centers, fetches their details and removes stale records.',
      'City and state pages generated from a Supabase database, with city descriptions drafted by an LLM and run through fact-check scripts.',
      'Leaflet maps on location pages and a search page for visitors who already know where they are.',
      'Claim pages so a center can correct its own listing, with an email route for submissions.',
      'A build tuned for a very large static site: prefetched data, batched pages and concurrency limits.',
    ],
    stack: ['Astro', 'Supabase', 'Leaflet', 'OpenAI and Gemini APIs', 'Vercel', 'Amazon Associates'],
    stats: [
      /*
       * The first three are the same figures work.astro and
       * docs/creative-bandit-launch-readiness.md (sections 7.2 to 7.4) carry,
       * all pulled 2026-08-18:
       *   Visitors     Ahrefs Web Analytics, trailing 12 months (Aug 2025 to
       *                Jul 2026): 127,018 / 12 = 10,585 a month. Stated as 10,000+.
       *   Top-10       Ahrefs Site Explorer, US, Aug 2026: 22 top-3 plus 63
       *                top 4 to 10 = 85.
       *   Bing share   Ahrefs Web Analytics: 87.5% of search traffic from
       *                Bing-family engines.
       * Pages: live sitemap, 4,561 <loc> entries, counted 2026-11-03.
       */
      { label: 'Monthly visitors', value: '10,000+' },
      { label: 'Top-10 rankings', value: '85' },
      { label: 'Search traffic from Bing-family engines', value: '87.5%' },
      { label: 'Pages in sitemap', value: '4,561' },
    ],
    lesson:
      'Check your numbers in more than one tool. Ahrefs estimates this site at about 200 organic visits a month and our own analytics records over 10,000. The tool models Google, and most of this site’s search traffic comes from Bing.',
    metaTitle: 'RecycleOldTech case study: a programmatic recycling directory',
    metaDescription:
      'How we built RecycleOldTech.com, a US electronics recycling directory on Astro and Supabase with 85 top-ten rankings and 10,000+ monthly visitors.',
    about: 'A directory of certified electronics recycling centers in the United States',
  },
  {
    slug: 'ebikelocal',
    title: 'eBikeLocal',
    shortTitle: 'eBikeLocal',
    categoryName: 'Directory / AI Data Pipeline',
    url: 'https://ebikelocal.com',
    image: '/images/ebikelocal_desktop.webp',
    imageAlt: 'eBikeLocal website screenshot',
    imageWidth: 1594,
    imageHeight: 923,
    summary:
      'A nationwide e-bike shop directory that tells you which brands a shop actually carries, fed by a pipeline that normalizes brand dealer locators.',
    problem:
      'Shoppers can find a bike shop on a map, but no independent directory says which e-bike brands the shop sells. Each brand publishes its own dealer locator, in its own format, and none of them agree on how to write an address.',
    built: [
      'Scrapers and normalizers for brand dealer locators, merged into one shop table with a shop-to-brand junction table.',
      'Google Places enrichment for hours, ratings, coordinates and photos, with the source of each image recorded.',
      'City, state, brand and bike model pages, plus ranked "best e-bikes" pages by budget and use.',
      'Leaflet maps with many pins on city pages and an embedded map on single shop pages.',
      'Audit scripts that check bikes, coordinates and website signals so bad records get caught before they ship.',
    ],
    stack: ['Astro 6', 'Neon Postgres', 'postgres.js', 'Tailwind CSS 4', 'Playwright', 'Cheerio', 'Leaflet', 'Vercel'],
    stats: [
      /*
       * Pages: live sitemap, 299 <loc> entries in a flat /sitemap.xml, counted
       * 2026-11-03.
       */
      { label: 'Pages in sitemap', value: '299' },
    ],
    lesson:
      'Directories are data problems first. A wrong address on a shop page costs more trust than a plain design ever will, so the audit scripts matter as much as the page templates.',
    metaTitle: 'eBikeLocal case study: an e-bike shop directory built on data',
    metaDescription:
      'How we built eBikeLocal on Astro and Neon Postgres, an e-bike shop directory that merges brand dealer locators and Google Places data to show what shops carry.',
    about: 'A directory of e-bike shops and brands across the United States',
  },
  {
    slug: 'downtowndry',
    title: 'DowntownDry',
    shortTitle: 'DowntownDry',
    categoryName: 'AI Integration',
    url: 'https://downtowndry.bar',
    image: '/images/downtowndry_desktop.webp',
    imageAlt: 'DowntownDry website screenshot',
    imageWidth: 1600,
    imageHeight: 1067,
    summary:
      'A directory of alcohol-free bars and venues, kept honest by a verification pipeline that pairs Google APIs with Gemini.',
    problem:
      'Alcohol-free venues open and close quickly, and plenty of listings are wrong in a way that matters: a place marked alcohol-free that serves beer is worse than no listing at all. Checking thousands of venues by hand does not scale.',
    built: [
      'An address-first check that anchors each venue to its exact Google Places record before anything else runs.',
      'Targeted Google searches per venue, with the snippets passed to Gemini to decide keep, remove or uncertain.',
      'Category validation that catches flags like "alcohol-free" on venues that serve alcohol.',
      'Generated descriptions and extracted contact details, written back to the database for review.',
      'City pages across the country, with scripts to find and add cities that are missing.',
    ],
    stack: ['Astro', 'Supabase', 'Tailwind CSS', 'Google Places and Search APIs', 'Gemini', 'Vercel'],
    stats: [
      /*
       * Pages: live sitemap, 2,705 <loc> entries, counted 2026-11-03.
       * The 97% accuracy and 90% review-time figures used on /work are not
       * repeated here: no document in speerdo/DowntownDry records how they
       * were measured, so they are out until someone can date and source them.
       */
      { label: 'Pages in sitemap', value: '2,705' },
    ],
    lesson:
      'Language models do not browse. The pipeline searches first, hands the model real snippets, and asks for a decision with evidence. Anchoring on the exact address keeps it from verifying the wrong venue.',
    metaTitle: 'DowntownDry case study: AI verification for a venue directory',
    metaDescription:
      'How we built DowntownDry, an alcohol-free venue directory whose pipeline checks each listing with Google Places, Google Search and Gemini before it goes live.',
    about: 'A directory of alcohol-free bars and venues',
  },
  {
    slug: 'yield-to-freedom',
    title: 'Yield to Freedom',
    shortTitle: 'Yield to Freedom',
    categoryName: 'Full-Stack Development / Fintech',
    url: 'https://yieldtofreedom.com',
    image: '/images/yieldtofreedom_desktop.webp',
    imageAlt: 'Yield to Freedom website screenshot',
    imageWidth: 1600,
    imageHeight: 1206,
    summary:
      'An income ETF research platform that grades funds from A to D and refreshes the data on a schedule, with no manual entry.',
    problem:
      'High-yield ETF pages rank funds by headline yield, which rewards funds that return your own capital while the price falls. Investors need to know whether a distribution is real and durable, and the data to answer that is scattered and goes stale.',
    built: [
      'A grading engine that scores each fund A to D, run on a schedule so grades follow the data.',
      'Cron jobs that sync prices and dividends, with scripts to backfill history for new funds.',
      'Fund profile pages, category pages, comparison pages and strategy guides.',
      'A screener and dividend and DRIP calculators for visitors who already know what they want.',
      'A distribution-cut report that flags funds that have lowered their payout.',
    ],
    stack: ['Astro', 'Neon Postgres', 'Drizzle ORM', 'Chart.js', 'Alpine.js', 'Vercel'],
    stats: [
      /*
       * Pages: live sitemap, 496 <loc> entries in a flat /sitemap.xml, counted
       * 2026-11-03.
       * Funds: docs/ETF_DATA_AUDIT_PLAN.md in speerdo/YieldToFreedom, "229 ETFs
       *   were regraded" in the final verification of the data audit (file last
       *   committed 2026-06-05). That is a count of active funds at that date.
       */
      { label: 'Pages in sitemap', value: '496' },
      { label: 'Active ETFs graded in the June 2026 audit', value: '229' },
    ],
    lesson:
      'A grade is only as good as the data under it. Before trusting the grader we ran a data audit: confirm every active fund has price rows, check dividend history, fix yield math, then regrade. Keep that audit script next to the grader.',
    metaTitle: 'Yield to Freedom case study: an income ETF grading platform',
    metaDescription:
      'How we built Yield to Freedom on Astro and Neon Postgres, an income ETF research site that grades funds A to D from data that syncs and regrades by schedule.',
    about: 'An income ETF research and grading platform',
  },
  {
    slug: 'home-power-ready',
    title: 'Home Power Ready',
    shortTitle: 'Home Power Ready',
    categoryName: 'Full-Stack Development / SEO',
    url: 'https://homepowerready.com',
    image: '/images/homepowerready_desktop.webp',
    imageAlt: 'Home Power Ready website screenshot',
    imageWidth: 1600,
    imageHeight: 825,
    summary:
      'A directory of standby generators, battery backup and installers, with sizing and cost calculators as the only JavaScript on the site.',
    problem:
      'Buying a whole-house generator means comparing models, sizing the load, finding an installer and guessing at cost. The pages that rank for these searches are slow, ad-heavy and thin on specs.',
    built: [
      'Static pages for generator models, brands, comparisons and guides, generated at build time from a Postgres catalog.',
      'Installer directory pages built from imported installer data.',
      'A sizing calculator and a cost calculator, the only client-side JavaScript, built as small Preact islands.',
      'Battery backup and solar generator sections that reuse the same catalog and templates.',
      'Amazon media and affiliate data imported by script, so product pages carry real images and links.',
    ],
    stack: ['Astro 7', 'Neon Postgres', 'Preact', 'TypeScript', 'Vercel', 'Amazon Creators API'],
    stats: [
      /*
       * Pages: live sitemap (sitemap-index.xml and its child), 134 <loc>
       * entries, counted 2026-11-03. The "167 static pages" on the /work card
       * could not be reproduced from the live sitemap, so it is not used here.
       */
      { label: 'Pages in sitemap', value: '134' },
    ],
    lesson:
      'Keep JavaScript for the parts that compute. Everything else was HTML at build time, which left two small calculators doing the only work in the browser.',
    metaTitle: 'Home Power Ready case study: a standby generator directory',
    metaDescription:
      'How we built Home Power Ready on Astro 7 and Neon Postgres, a standby generator and battery backup directory with sizing and cost calculators as small islands.',
    about: 'A directory of standby generators, battery backup and installers',
  },
];

export const caseStudySlugs = caseStudies.map((c) => c.slug);

/** The path a /work card or homepage card should link to, or undefined if the project has no case study. */
export function caseStudyPathFor(slug: string): string | undefined {
  return caseStudySlugs.includes(slug) ? `/work/${slug}/` : undefined;
}
