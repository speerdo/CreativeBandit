# Case studies and first blog posts

Approved by adam on 2026-11-03 in #creativebandit. One branch (`content/case-studies-blog`), one PR.

## Why

/work only links out to the live sites. That makes /work a dead end for search: there's nothing on our own domain describing what we built. The blog is fully wired up (MDX, RSS, Article schema) but empty and noindexed, so it ranks for nothing.

## Part A: case study pages (builder)

One page per project we own, at `/work/<slug>`:

| slug | project | live |
|---|---|---|
| `homewaterpure` | HomeWaterPure | https://homewaterpure.com |
| `invoice-for-trades` | Invoice for Trades | https://invoicefortrades.com |
| `recycleoldtech` | RecycleOldTech.com | https://recycleoldtech.com |
| `ebikelocal` | eBikeLocal | https://ebikelocal.com |
| `downtowndry` | DowntownDry | https://downtowndry.bar |
| `yield-to-freedom` | Yield to Freedom | https://yieldtofreedom.com |
| `home-power-ready` | Home Power Ready | https://homepowerready.com |

Client work (Mounjaro, EdReports, SFDO, AdAg, ABLS, IANA, Viewfinder) is out of scope. Those cards keep linking out.

### Build

- Put the data in `src/data/caseStudies.ts` (typed array). Add one dynamic route, `src/pages/work/[slug].astro`, with `getStaticPaths`. `work/motion.astro` already exists, so make sure no slug collides with `motion`.
- Each page has these sections, in this order:
  1. Hero: title, category label (reuse the `categoryName` from `work.astro`), a one-line summary, a "Visit the site" button (external, `rel="noopener"`), and the existing `/images/<x>_desktop.webp` screenshot with `width`/`height` set.
  2. **The problem**: 1 short paragraph. Who the site is for, and what was wrong with what already existed.
  3. **What we built**: 3 to 5 bullets of concrete features.
  4. **Stack**: a chip list (framework, DB, hosting, notable libraries/APIs).
  5. **Results**: a stat row, reusing the existing stat styling from `work.astro`/`index.astro`. Include only numbers you can source (see Rules). If a project has no sourced numbers yet, drop the section. Don't pad it.
  6. **What we'd tell another builder**: one lesson, 2 to 3 sentences.
  7. CTA: link to `/contact/` and back to `/work/`.
  8. "More work": 3 other case study cards.
- On `/work` and in the homepage featured block, cards for these 7 projects link to `/work/<slug>/` (internal) instead of the external site. The external link lives on the case study page.
- Homepage featured block: replace EdReports with HomeWaterPure, and RecycleOldTech with Invoice for Trades. That leaves DowntownDry, YTF, HomeWaterPure and Invoice for Trades.
- JSON-LD: a `CreativeWork` per page (name, description, url, image, `creator: {'@id': ORG_ID}`, `about`), plus a `BreadcrumbList` (Home > Work > Project). Add a `caseStudy()` helper to `src/lib/schema.ts` next to `article()`.
- Add each page's `<title>`/meta description. Format: `<Project> case study: <what it is>`, with descriptions of 140 to 160 chars.
- Add the pages to `public/llms.txt` if it lists pages.

### Rules (read these)

- **Every number needs a source.** Get them from the project's own repo docs (`~/Projects/<repo>/docs`, README), from the comments in `src/pages/work.astro` (the YTF/RecycleOldTech figures are sourced there), or by counting the live site's sitemap. Put the source and date in a code comment next to each stat, the same way `work.astro` does. If you can't source a number, leave it out and list it in your hand-off.
- **No em dashes (—) anywhere in the copy, and no en dashes used as dashes.** Use commas, periods, colons or parentheses. Before handing off, `grep -rn "—" src/data src/pages/work` must return nothing.
- The voice is plain and specific, written as "we". No "leverage", "seamless", "cutting-edge", "robust", "in today's digital landscape". Short sentences.
- Use palette tokens and the existing classes only (`label-tech`, `chip`, `btn-primary`, `crop-marks`, etc.). No raw hex or rgba.
- `npm run build` and `npm test` pass. Check that the sitemap includes the 7 new URLs.

## Part B: blog posts (Opus drafts, adam reviews)

Four MDX posts in `src/pages/blog/`, bylined to Adam Speer (`authorImage: /images/adam-speer.webp`):

1. Why most of our search traffic comes from Bing, not Google
2. A no-signup invoice generator: PDFs in the browser with Svelte 5
3. What our AI-readiness scanner keeps finding on small-business sites
4. Sourcing and dating every spec: how HomeWaterPure handles product data

Same rules: no em dashes, first-party numbers with sources, adam's voice. Each post links to its matching case study.

Once the posts land:
- remove `|blog` from the sitemap filter in `astro.config.mjs`
- add /blog to `llms.txt`
- confirm the page's noindex turns itself off (it does when `posts.length > 0`)

## Out of scope

Comments, tags pages, pagination, a CMS. We can add these when there are more than about 10 posts.
