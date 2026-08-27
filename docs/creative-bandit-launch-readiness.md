# Creative Bandit — Launch Readiness Audit

**Date:** 2026-08-18
**Branch:** `adam-launch-readiness-pass`
**Scope:** creativebandit.studio — SEO, Open Graph, accessibility, performance, measurement, and content credibility, plus verified Ahrefs data for the featured RecycleOldTech project.

**Method.** Read every page, component and config in `src/`, built the site (`npm run build`, clean) and audited the emitted HTML in `dist/client`. Ahrefs figures come from the MCP API against the verified Web Analytics project `8362376` (first-party) and Site Explorer (third-party estimates). Both sources are labelled throughout, because on this site they disagree by more than an order of magnitude and the reason turns out to matter.

---

## 0. Verdict

**Do not launch as-is.** The build is clean and the technical SEO foundation is genuinely good — canonicals resolve absolute, one `<h1>` per page, real JSON-LD entity nodes, sitemap, RSS, `llms.txt`, a strict CSP and a full security-header set. That work is done and it is above the norm for a studio site.

What blocks launch is not infrastructure. It is that **two lead-capture forms are wired to placeholder endpoints, and visible `[TODO]` placeholders ship on four pages.** A visitor who tries to contact the studio today gets nothing, and the exit popup shows them a success message while dropping their email on the floor. For a studio whose entire pitch is "we operate what we sell" and that sells an audit product, shipping `[TODO: $/mo]` on a pricing table is the specific failure the positioning cannot survive.

| Area | State | Blockers |
|---|---|---|
| Lead capture | **Broken** | 2 |
| Content placeholders | **Broken** | 4 pages |
| SEO / crawlability | Good | 0 |
| Open Graph / social | Good, minor gaps | 0 |
| Structured data | Good | 0 |
| Accessibility | Needs work | 0 blockers, 6 fixes |
| Performance | Good, some waste | 0 blockers, 5 fixes |
| Measurement | **Absent** | 1 |
| Security headers | Good | 0 |

Counting P0s only: **7 items stand between this and a launch.** They are all small. None is architectural.

---

## 1. Launch blockers (P0)

### 1.1 The contact form does not submit anywhere

`src/components/ContactForm.astro:5`

```html
<input type="hidden" name="access_key" value="YOUR_ACCESS_KEY">
```

Web3Forms rejects the POST. This is the only contact route on the site besides the `mailto:` in the footer, and `/contact` is the destination of the primary nav CTA ("Book a Free Call") on every page. Confirmed present in the built output (`dist/client/contact/index.html`).

**Fix:** create the Web3Forms access key, put it in the markup (it is a public key by design, so it can be committed), and submit a real test through to the inbox before merging. Also verify the `redirect` to `/thank-you` fires.

### 1.2 The exit popup silently discards emails, and promises an asset that does not exist

`src/components/ExitPopup.tsx:112-118`

```jsx
<form action="YOUR_KIT_FORM_URL" method="POST" onSubmit={() => setSubmitted(true)}>
```

Three compounding problems:

1. The action URL is a placeholder, so the POST fails.
2. `onSubmit` sets the success state unconditionally, so the visitor is shown a confirmation regardless. They believe they subscribed. They did not.
3. It offers an "AI Automation Readiness Checklist" PDF. That asset does not exist — `src/pages/index.astro:305` and `src/components/Footer.astro:55` both carry TODOs saying the newsletter and lead magnet were pulled *precisely because* the ConvertKit form and PDF do not exist yet. The popup was left behind.

This component renders on **every page** (`Layout.astro:105`) and triggers at 50% scroll or on exit intent.

**Fix — recommended:** remove `<ExitPopup />` from the layout until the Kit form and the PDF both exist. That is consistent with the decision already made for the footer banner and the homepage checklist section. If it stays, the success state must be conditional on an actual successful response.

### 1.3 Pricing placeholders are live on `/services/agent-ops`

`src/pages/services/agent-ops.astro:26-28, 93`

```
Starter  — Up to 10 sites — [TODO: $/mo]
Agency   — Up to 50 sites — [TODO: $/mo]
Scale    — 50+ sites      — [TODO: Contact for bundle pricing]
```

Plus, in the body copy: *"Pilot pricing, finalized as we onboard the first agencies. [TODO: confirm rates]"*.

A published pricing table reading `[TODO: $/mo]` is worse than no pricing table. It is also indexed — `/services/agent-ops/` is in the sitemap.

**Fix:** set the three prices, or replace the table with a "Contact for pricing" panel and remove the tier rows. Either is fine; shipping the placeholder is not.

### 1.4 Three fake portfolio projects on `/work`

`src/pages/work.astro:142-171` — `[TODO: Design Project 1]`, `[TODO: Design Project 2]`, `[TODO: Motion Project 3]`. Each ships with a Pexels stock photo, `link: '#'`, and `[TODO: what the work was and what it did for the client]` as its description.

These are the **only** entries under the `design` and `motion` filters. A visitor who clicks "Design" or "Motion" — two of the eight filter chips, and half of what the studio sells — gets a grid of three placeholders. The nav promises Katlyn's design and motion practice; the portfolio proves it does not exist.

**Fix:** add Katlyn's real work, or remove the three placeholder objects **and** the `design` / `motion` filter chips together. Removing them is honest and takes ten minutes; a portfolio that quietly omits a discipline reads far better than one that advertises it with stock photos.

### 1.5 Placeholder testimonials on the homepage

`src/pages/index.astro:316-328` renders two `TestimonialCard`s reading `"[TODO: gather a real client quote]"` — `[TODO: name]`, `[TODO: title]`, `[TODO: company]` — under a heading that says **"Trusted By Real Clients"**.

**Fix:** remove the entire testimonials section until real quotes exist. The heading makes the placeholder actively worse than the absence.

### 1.6 No 404 page

There is no `src/pages/404.astro`, and the build emits no `404.html` (verified). Vercel serves its generic default — unbranded, no navigation, and a dead end for anyone landing on a stale URL.

**Fix:** add `src/pages/404.astro` using `Layout`, with links to `/`, `/work`, `/services` and `/scan`. The sitemap filter in `astro.config.mjs` already excludes `/404`, so it is wired for it.

### 1.7 No analytics — the launch cannot be measured

There is no analytics on the site at all. No Vercel Analytics, no Ahrefs Web Analytics, nothing. `src/pages/privacy.astro:56` states this explicitly and correctly.

The studio already runs Ahrefs Web Analytics on five of its own properties (RecycleOldTech, DowntownDry, eBikeLocal, YieldToFreedom, HomePowerReady) — this is the only property without it. Launching the site that is meant to generate the agency pipeline with zero instrumentation means the first month of traffic is unrecoverable.

**Two things must change together:**
1. Install a tracker. Ahrefs Web Analytics is the obvious pick — already paid for, already the tool used for every other property, cookieless.
2. **The CSP will block it.** `vercel.json` sets `script-src 'self' 'unsafe-inline'` and `connect-src 'self'`. Ahrefs' script and its beacon endpoint both need allowlisting, or the tracker fails silently in production and works fine locally.
3. Update `privacy.astro:56`, which currently promises no analytics.

---

## 2. SEO

### Working well — leave alone

- `site` is set, so canonicals and `og:image` resolve absolute (`https://creativebandit.studio/work/` — verified in built HTML).
- Exactly one `<h1>` on all 15 pages. Titles are unique and well-formed.
- Real JSON-LD **entity** nodes (`Service`, `LocalBusiness`, `Person`) in a single `@graph`, not just `Organization` boilerplate. `src/lib/schema.ts` is unusually careful and its reasoning is documented.
- `sitemap-index.xml` generated, advertised in `robots.txt`, with `/thank-you` and `/404` filtered out.
- `robots.txt` deliberately open, with the reasoning written down.
- `llms.txt` present and genuinely useful.
- RSS feed at `/rss.xml`, linked via `<link rel="alternate">`.

### 2.1 The blog is three filler posts from March 2024 (P1)

`src/pages/blog/` contains `getting-started-with-ai.mdx`, `web-development-trends-2024.mdx` and `design-systems-guide.mdx` — dated 2024-03-15, 2024-03-10 and 2024-03-05, each with a Pexels stock hero, each generic ("Artificial Intelligence (AI) is changing how we build and interact with digital products").

All three are in the sitemap and the RSS feed. One is titled *"Web Development Trends to Watch in 2024"* — two and a half years stale on a site launching in August 2026, from a studio selling AI currency.

**Fix:** delete all three. Ship `/blog` empty or drop it from the nav until there is one real post. Generic 2024 AI filler under a byline that says "8+ years, Fortune 500" costs more credibility than an empty blog does.

### 2.2 Stock photography on `/services` and `/about` (P1)

Six Pexels images on `/services` (`services.astro:374-379`) and one on `/about` (*"Creative team collaborating on digital innovation"*). Generic agency stock, hotlinked from `images.pexels.com` — so they are also a third-party dependency, uncached, unoptimised, and outside the studio's control.

This sits badly beside `ProjectCard.astro`'s own comment, which explains that the duotone treatment was removed *because* the screenshots are real work now. The services page did not get that pass.

**Fix:** replace with the mascot illustrations (already commissioned, already on-brand, already local) or with real project screenshots. Failing that, remove the images — the sections read fine without them.

### 2.3 `og:image:alt` and `twitter:image:alt` missing (P2)

`Layout.astro:71-81` sets `og:image`, width and height but no alt text. Screen readers on Slack, LinkedIn and X get nothing.

### 2.4 `foundingDate: '2026'` vs "8+ years experience" (P2)

`schema.ts:44` and `llms.txt` both say founded 2026. The homepage and `/about` say "8+ years". Both are true — the LLC is new, Adam's career is not — but an assistant reading the structured data will answer "founded 2026" against copy claiming 8+ years and may flag the inconsistency.

**Fix:** keep `foundingDate` accurate, and make the copy say "8+ years of experience" rather than anything implying the *studio* is that old. Most of it already does; check `/about`.

### 2.5 `<meta name="keywords">` (P3)

`Layout.astro:60` emits a long keywords meta on every page. Ignored by every major engine since ~2009. Harmless, but it is the kind of thing the studio's own scanner would list as cruft. Consider removing for consistency with the product.

---

## 3. Open Graph and social

Solid. `og:type`, `og:url`, `og:title`, `og:description`, `og:image` (absolute), explicit `1200x630`, `og:site_name`, `twitter:card=summary_large_image` and the Twitter equivalents are all present and correct. The OG image itself is verified 1200×630 PNG.

Two improvements:

### 3.1 One OG image for all 15 pages (P2)

Every page shares `/og-image.png`. A link to `/scan` and a link to `/work` look identical when shared. The `ogImage` prop already exists on `Layout` — nothing is passing it.

**Fix (cheap):** author 3–4 static variants — home, scan, work, services — and pass them. A full dynamic OG route is not worth it at 15 pages.

### 3.2 `og-image.png` is 271 KB (P3)

Not render-blocking, but it is fetched by every crawler and preview unfurler. A PNG→WebP conversion with a PNG fallback, or just a quantisation pass, takes it under 100 KB.

---

## 4. Accessibility

No blockers. The foundation is better than most: `:focus-visible` gives a 2px acid ring with offset (`global.css:172`), `prefers-reduced-motion` is handled in three separate places (global CSS, the Three.js hero, and the count-up stats), the colour tokens carry **measured contrast ratios in comments** with usage rules (`global.css:38-46`), decorative images use `alt=""` correctly, and dead `href="#"` social links were already removed from `Footer` and `TeamMember` with the reasoning recorded.

That said, six things need fixing.

### 4.1 No skip link (P1)

No skip-to-content link anywhere. Every page has a fixed header plus a full nav, so a keyboard or screen-reader user tabs through the logo, four nav items and a CTA before reaching content — on all 15 pages.

**Fix:** add a visually-hidden, focus-visible skip link as the first child of `<body>` in `Layout.astro`, targeting `<main id="main">`.

### 4.2 Mobile nav toggle has no state (P1)

`Navbar.astro:42` — the button toggles `hidden`/`flex` on the menu with no `aria-expanded` and no `aria-controls`. A screen reader user cannot tell whether the menu is open.

**Fix:** add `aria-expanded="false"` and `aria-controls="navMenu"`, and flip `aria-expanded` in the toggle handler in `Layout.astro:107-120`. While there: the menu does not close on Escape, and focus is not moved into it.

### 4.3 The exit popup is not a dialog (P1)

`ExitPopup.tsx` — no `role="dialog"`, no `aria-modal="true"`, no labelled title, no Escape handler, no focus trap, no focus restoration on close. It covers the viewport and takes clicks. A keyboard user can tab behind it; a screen reader user is not told it appeared.

If 1.2 is resolved by removing the component, this disappears with it. If it stays, all six need adding.

### 4.4 `/work` filter buttons don't announce state (P2)

`work.astro:199-206` — the chips carry a visual `.is-active` class only. No `aria-pressed`, no `role="group"`, and the result count is not announced when the grid changes. Same pattern on `/blog`.

**Fix:** `aria-pressed` on each chip, toggled alongside `is-active`, and an `aria-live="polite"` region reporting "Showing N projects".

### 4.5 `ink-hot` on `base` is 4.97:1 — AA by 0.03 (P2)

`global.css:42` documents this honestly. It passes, but with no margin, and it is used for body-sized links throughout (`ServiceCard` "Learn More", the `/work` "Visit Site" links). Any future darkening of the background breaks it.

**Fix:** either lift the hot ink one step for text use, or restrict `ink-hot` to ≥19px bold and use `ink-acid` for small links — the pattern `ink-cold` / `ink-cold-lift` already establishes.

### 4.6 The sleeping-cat mascot eats clicks (P2)

`Footer.astro` documents it: the mascot is decorative but takes pointer events (that drives its hover animation) and sits over the bottom-right of whatever section precedes the footer, at up to 210px wide. The comment says "No page currently puts a control there; keep it that way, or this will silently eat the clicks."

That is a real constraint documented in a code comment, which is where constraints go to die.

**Fix:** add `aria-hidden="true"` and drive the hover from a parent wrapper, or scope `pointer-events` to the cat's own path rather than its bounding box.

---

## 5. Performance

Build is clean and fast. Astro static output, 15 prerendered pages, one serverless function for `/api/scan` only. Gzipped: CSS 10.7 KB, homepage HTML 27 KB. Project screenshots are WebP with `loading="lazy"` and `decoding="async"`. The Three.js hero is exemplary — dynamic import, desktop-only, gated on `IntersectionObserver`, skipped entirely under reduced motion, with a static fallback and bfcache-aware cleanup.

Five things to fix.

### 5.1 React ships on every page for a popup (P1)

`Layout.astro:105` mounts `<ExitPopup client:only="react" />` globally. That pulls `client.DmcGvEiD.js` — **184 KB raw / 57 KB gzipped** — onto all 15 pages. `AnimatedStats` (homepage only) is the only other React island, and it is 2.3 KB.

So the entire React runtime is being downloaded on `/privacy`, `/terms`, `/contact` and every other page, to support a modal that currently posts to a placeholder URL.

**Fix:** removing the popup (1.2) removes the React runtime from 14 of 15 pages at a stroke. If it stays, rewrite it as a ~30-line vanilla `<script>` — it needs `localStorage`, two listeners and a `hidden` toggle — and drop `@astrojs/react` to the homepage only.

### 5.2 42 of 73 images have no `width`/`height` (P1)

Every `ProjectCard`, `TeamMember`, blog card and the `/work` featured screenshot renders without intrinsic dimensions. Layout is held by Tailwind classes (`h-64`, `aspect-square`), which mostly prevents visible shift — but the browser cannot reserve space before CSS applies, and it is a direct CLS risk on slow connections. The `Navbar`, `Footer` and hero fallback images *do* set dimensions, so the pattern is established.

**Fix:** add `width`/`height` to `ProjectCard.astro`, `TeamMember.astro`, `blog/index.astro` and `work.astro:238`. All source dimensions are known (screenshots are 1200–1600px wide; portraits are 800×800 and 761×761).

### 5.3 Google Fonts is render-blocking (P1)

`Layout.astro:92` loads three families — Archivo (variable, `62..125` width × `400..900` weight), Inter (3 weights), Space Mono (2 weights) — via a blocking `<link rel="stylesheet">` to `fonts.googleapis.com`. `preconnect` is set for both hosts, which helps, but the stylesheet still blocks first paint on a third-party round trip.

**Fix:** self-host via `@fontsource-variable/archivo` etc., or `fontsource` for the static faces. Removes two DNS lookups, two TLS handshakes and a render-blocking request from every page load; lets the CSP drop `fonts.googleapis.com` and `fonts.gstatic.com`; and lets the fonts be served from the same CDN edge as everything else. Also subset — the full Archivo variable range across two axes is large, and the site uses a narrow slice of it.

### 5.4 Hotlinked Pexels images (P2)

Seven images on `/services` and `/about` load from `images.pexels.com` at `w=1260&h=750&dpr=2` — i.e. 2520×1500 source, rendered into a column roughly 600px wide. No `loading="lazy"`, no dimensions, no control over caching. Resolved by 2.2.

### 5.5 Portrait images are oversized (P3)

`adam-dev-bandit.webp` is 211 KB and `katlyn-design-bandit.webp` 160 KB, both rendered into a square card. `recycleoldtech_desktop.webp` is 146 KB at 1554×1240 rendered into a 64-unit-tall crop. A re-encode pass at the delivered size would save ~400 KB across the site. Low priority — they are lazy-loaded and below the fold.

---

## 6. Security headers

Genuinely good, and better than most sites this size. HSTS with `preload`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, a `Permissions-Policy` that disables camera/mic/geolocation/FLoC, and a real CSP with `default-src 'self'`, `object-src 'none'` and `form-action` scoped to `'self'` plus Web3Forms.

Two notes:

- **`script-src 'unsafe-inline'` (P2).** Required today by Astro's inline hydration scripts. Worth revisiting with a nonce or hash-based policy later; not a launch blocker.
- **The CSP will break analytics (P0, covered in 1.7).** `connect-src 'self'` blocks any beacon. Whatever tracker goes in needs its script and connect origins added at the same time.

---

## 7. RecycleOldTech — the real numbers

The site currently shows four stats for the featured project (`work.astro:16-21`). Three of them cannot be sourced from Ahrefs at all, and the one that can was **understated**.

### 7.1 What the site claims today

| Claim | Verifiable in Ahrefs? | Verdict |
|---|---|---|
| 8,000+ Monthly Visitors | Yes — first-party | **Understated.** Real trailing-12 is 10,585/mo |
| 8.08% Affiliate Conversion | No | Amazon Associates data — source separately |
| $300+ Monthly Ad & Affiliate Revenue | No | Ad network + Associates — source separately |
| 1,000+ Monthly Referrals | No | Outbound click tracking — source separately |

**Only the traffic figure is verifiable from Ahrefs.** The other three come from Amazon Associates and the display ad network. They may well be accurate — but nothing in this audit confirms them, and they should not be presented as verified until pulled from those dashboards. Flagging this explicitly because the brief was to stop guessing.

### 7.2 Two sources that disagree by 30–85×

This is the most interesting thing in the data, and it is worth understanding before quoting anything.

| Source | Aug 2026 | Trailing 12mo avg |
|---|---|---|
| **Ahrefs Site Explorer** (third-party estimate) | 200 organic visits/mo | 77/mo |
| **Ahrefs Web Analytics** (first-party, verified) | ~11,480/mo run-rate | 10,585/mo |

Ahrefs Site Explorer models **Google** SERPs. This site barely uses Google. From the referrer data (Aug 2025 – Aug 2026):

| Engine | Visitors | Share of search |
|---|---|---|
| Bing | 32,798 | 39.7% |
| DuckDuckGo | 20,550 | 24.9% |
| Yahoo (all subdomains) | 17,226 | 20.8% |
| **Google** | **10,296** | **12.5%** |
| Ecosia | 1,316 | 1.6% |
| AOL | 443 | 0.5% |

DuckDuckGo, Yahoo, Ecosia and AOL are all Bing-powered. **Bing-family engines drive 87.5% of this site's search traffic; Google drives 12.5%.** A Google-modelled estimate therefore sees roughly an eighth of the picture, and undercounts long-tail directory pages further still.

This is a strong, defensible story and it is directly on-brand: Bing is what powers Copilot and ChatGPT's search. A studio selling AI readiness has a property that is, measurably, an AI-search-first site. It also lands the "we operate what we sell" claim harder than any of the current stats do — *"our own SEO tool was wrong about our own site by 35×, and we could prove it because we instrument our properties."*

**Use first-party figures publicly. Never quote the Site Explorer estimate as traffic.**

### 7.3 Traffic, month by month (first-party)

Ahrefs Web Analytics on `www.recycleoldtech.com`. The tag went live in May 2025, so the window is 16 months of real data, not 18 — there is nothing before that to trace.

| Month | Visitors | Pageviews |
|---|---|---|
| 2025-05 | 18 | 73 |
| 2025-06 | 204 | 355 |
| 2025-07 | 1,082 | 1,414 |
| 2025-08 | 1,998 | 2,801 |
| 2025-09 | 3,615 | 6,358 |
| 2025-10 | 8,290 | 10,614 |
| 2025-11 | 9,473 | 12,302 |
| 2025-12 | 10,454 | 13,139 |
| 2026-01 | 13,647 | 17,497 |
| 2026-02 | 14,519 | 18,632 |
| **2026-03** | **20,695** | **30,930** |
| 2026-04 | 13,551 | 19,918 |
| 2026-05 | 9,737 | 15,790 |
| 2026-06 | 9,766 | 17,160 |
| 2026-07 | 11,273 | 19,936 |
| 2026-08 (to 18th) | 6,666 | 11,343 |

**Headline figures:**

- **Lifetime:** 133,883 visitors · 141,674 visits · 198,262 pageviews
- **Trailing 12 months** (Aug 2025 – Jul 2026): 127,018 visitors → **10,585/month average**
- **Last 6 complete months** (Feb – Jul 2026): 79,541 visitors → **13,257/month average**
- **Peak month:** March 2026 — 20,695 visitors, 30,930 pageviews
- **Current run-rate:** ~11,480/month (Aug 1–18 extrapolated)
- Avg session 256s, 1.39 pages/session, 78.8% bounce (typical for a directory — visitors find a local center and leave)

Note the April–May 2026 dip from the March peak. Traffic has since recovered to ~11k/mo but has not retested 20k. Worth understanding before publishing a growth narrative.

### 7.4 Traffic sources (lifetime)

| Channel | Visitors | Share |
|---|---|---|
| Search | 82,990 | 62.0% |
| Direct | 47,316 | 35.3% |
| Internal | 3,902 | 2.9% |
| **LLM** | **690** | **0.5%** |
| Unknown | 357 | 0.3% |
| Social | 213 | 0.2% |
| Email | 12 | <0.1% |

The **LLM channel is small but real**: 690 visitors arriving from assistant surfaces, led by `chatgpt.com` (172) and `copilot.microsoft.com` (148). For a studio that sells an AI readiness scan, this is the single most useful number in the dataset — it is direct evidence that the checks they audit for actually produce referral traffic. Nothing on the current site mentions it.

The 94.5% bounce rate on direct traffic is worth a look — it is high enough to suggest bot or referrer-stripped traffic rather than genuine type-ins.

### 7.5 Search visibility (Ahrefs Site Explorer, US)

Keyword rankings are estimates, but the *trend* is sound and it is the cleanest growth story in the data.

| Month | Top 3 | Top 4–10 | **Top 10 total** | Total tracked |
|---|---|---|---|---|
| 2025-06 | 0 | 0 | **0** | 32 |
| 2025-09 | 0 | 2 | **2** | 67 |
| 2025-12 | 1 | 10 | **11** | 59 |
| 2026-03 | 5 | 34 | **39** | 115 |
| 2026-06 | 8 | 52 | **60** | 103 |
| **2026-08** | **22** | **63** | **85** | **115** |

**Zero to 85 top-10 rankings in 14 months**, with top-3 placements tripling since June. Positions 51+ went from 15 to **0** — nothing is stranded on page 5 any more. This is the automated content pipeline working, and it is a far better proof point than "8.08% conversion" because it is independently checkable.

**Domain Rating:** 2.0 (May 2025) → **6.0** (Aug 2026), peaking at 7.0 in April.
**Backlinks:** 600 live from **455 referring domains** (717 / 476 all-time).

### 7.6 Best-performing pages (Aug 2025 – Aug 2026)

| Page | Visitors | Note |
|---|---|---|
| `/` | 4,048 | |
| `/claim` | 3,354 | **99.65% bounce** — see below |
| `/states/illinois` | 1,018 | 29% bounce |
| `/states/arizona/phoenix` | 882 | |
| `/states/michigan` | 880 | 23% bounce |
| `/blog/best-buy-vs-staples-vs-ecoatm` | 844 | **231s avg** — best engagement on the site |
| `/states/nevada/reno` | 840 | |
| `/blog/recycling-guide` | 777 | 171s avg |
| `/states/oregon/portland` | 744 | |
| `/states/ohio` | 721 | 25% bounce |

Two things fall out of this:

**The long tail is the whole business.** These top 12 pages account for ~15,400 of ~127,000 trailing-12 visitors — **roughly 12%**. The other 88% is spread across hundreds of city and state pages. That is exactly what a programmatic SEO pipeline is supposed to produce, and it is a better argument for the build than any single metric currently on the site.

**The comparison post outperforms everything.** `/blog/best-buy-vs-staples-vs-ecoatm` holds **#1 for "staples printer recycling"** (600 searches/mo), plus #1 for "staples laptop recycling", "does staples recycle tvs" and "does staples take old printers", and #3 for "staples monitor recycling". One post, five #1-or-near rankings, and 231s average engagement. Directly relevant to the studio's own content strategy.

**`/claim` needs attention (RecycleOldTech, not this site).** Second-most-visited page, 3,354 visitors, **99.65% bounce**, 61s average. Whatever it is meant to do, it is not doing it. Outside the scope of this launch but worth a ticket.

### 7.7 Recommended stat block for `/work`

Replacing `work.astro:16-21`. Every figure below is first-party and conservative:

| Label | Value | Source |
|---|---|---|
| Monthly Visitors | **10,000+** | Trailing-12 average is 10,585 |
| Top-10 Google Rankings | **85** | Ahrefs, Aug 2026, US |
| Referring Domains | **455** | Ahrefs, live |
| Visitors From AI Assistants | **690** | First-party LLM channel |

If the Amazon Associates numbers get confirmed from the dashboard, swap one in. Until then these four are all verifiable, and "85 top-10 rankings" and "690 visitors from AI assistants" both sell the studio's actual competence better than a revenue figure that reads as small.

The supporting copy at `work.astro:251` should also change: it currently says affiliate placements convert "at roughly four times the category average", which is the unverified 8.08% claim restated.

---

## 8. Internal inconsistency to resolve

`AnimatedStats.tsx:20` and `index.astro:263` claim **100%** AI verification accuracy for DowntownDry. `index.astro:50` and `work.astro:57` claim **97%** for the same project. Both ship on the homepage, roughly 200 lines apart.

Pick one and use it everywhere. 97% is the more credible number and is the one carried in the project descriptions; 100% invites the question the studio does not want asked.

---

## 9. The scan funnel — gating and CTA coverage

Two decisions raised during the launch pass, answered here because they interact.

### 9.1 Should the scan require an email? **No — but capture after the result.**

Gating the scan would contradict published copy in four places:

| Location | Promise |
|---|---|
| `SpaceSceneHero.astro` | "No call required. Usually a few seconds." |
| `index.astro:157` | "No account, no discovery call, no form that asks for your budget range before it tells you anything." |
| `scan.astro` intro | The same sentence again, verbatim |
| `scan.astro` submit note | "No call required." |

The ungated run *is* the differentiator. Every comparable tool gates; the pitch is explicitly "most AI conversations start with a pitch deck, this one starts with findings." And the audience makes gating worse rather than better — agencies are technical buyers who answer email walls with burner addresses, so the trade is a remarkable tool for a list of junk.

**But the concern behind the question is real.** There is currently no funnel after the scan at all. A visitor runs it, gets the findings, and leaves. The only post-result CTA is "Talk to Us About the Build" → `/contact`, and nothing is captured, so there is no follow-up and no attribution.

**Recommendation: keep the run ungated, and offer capture *after* the findings render.**

Run the scan → show the full report exactly as now → then, below the results block, offer "Email me this report."

This is better than a gate on four counts:

1. Every published promise stays true.
2. Intent is far higher. You capture people who read real findings and want to act, not people checking whether the tool works.
3. **The offer matches a need the copy already names.** `scan.astro` tells agencies to "take these findings to your client and win the work yourself." They want to *forward* this. A clean, shareable — ideally white-labelable — version of the report is genuinely worth an email to them, which a generic newsletter signup is not.
4. It costs the visitor nothing they already have. The on-screen report stays either way, so the ask reads as a convenience rather than a toll.

Implementation is small: an email field under `#scanResults` posting to the same Web3Forms endpoint with the scanned URL and findings attached. A plain "send me a copy" is enough to start; the white-label PDF can come later.

**Prerequisite.** `docs/creative-bandit-ai-readiness-scan.md` records that scan rate limiting is in-memory, therefore per-instance and reset by cold starts — "a speed bump, not the §6 requirement. Shared state is needed before this is linked publicly." That has been tolerable because `/scan` is barely linked. §9.2 changes that, so the two must land together.

### 9.2 Should there be more CTAs to the scan? **Yes — coverage is the gap.**

`/scan` is currently linked from **four places**: the homepage hero, twice more on the homepage, and the new 404 page. Plus `llms.txt`.

It is **not** linked from the navbar, the footer, `/services`, `/services/wordpress`, `/services/agent-ops`, `/work`, `/about`, or `/contact`.

Meanwhile every one of those pages leads with `/contact`:

| Page | Primary CTA |
|---|---|
| `/services` | Discuss Your Project → `/contact` |
| `/services/wordpress` | Start a WordPress Project → `/contact` |
| `/services/agent-ops` | Book a Free Audit → `/contact` (×3) |
| `/work` | Contact Us → `/contact` |
| `/about` | Start Your Project → `/contact` |
| Navbar (all pages) | Book a Free Call → `/contact` |

So the homepage calls the scan "Start here" and frames it as the top of the funnel, while **the scan is reachable only from the homepage and every internal page pushes the higher-friction ask instead.** That is backwards: the scan is the low-friction, high-differentiation entry point, and `/contact` is the commitment.

Recommended additions, in priority order:

1. **Footer, Services column** — "Free AI Readiness Scan". Sitewide, one line, biggest single win.
2. **Navbar** — add `/scan` as a fifth nav item rather than replacing "Book a Free Call". The two asks serve different readiness stages and the nav has room. The mobile menu renders from the same array, so it inherits automatically.
3. **`/services/wordpress`** — the scan's entire pitch is "point it at a client's WordPress site". This is the most on-target page on the site and it does not mention it.
4. **`/services/agent-ops`** — audience is agencies running 10–50 sites. "Scan one of them free" is the natural step before a retainer conversation.
5. **`/services`** — add as the secondary CTA alongside "Discuss Your Project".
6. **`/work`** — someone who has just read the RecycleOldTech proof is well primed for a free audit.
7. **`/thank-you`** — a dead-end page today. Offering the scan while they wait for a reply is free upside.
8. **`/about`** — lowest priority.

**One caveat:** do not give it equal weight everywhere. If every page shouts *scan*, it stops reading as a considered recommendation. Lead with the scan where the visitor is still evaluating (services, wordpress, agent-ops, work); lead with contact where they have already shown intent.

---

## 10. Implementation plan

### Phase 1 — Launch blockers

**Status: 12 of 13 done.** The one remaining item is a dashboard toggle, not code.

- [x] **1.1** Web3Forms access key set in `ContactForm.astro` — *still needs a live submission test through to the inbox, and confirmation the `/thank-you` redirect fires*
- [x] **1.2** `ExitPopup` removed from `Layout.astro` and deleted
- [x] **1.3** Agent Ops tier prices replaced with a pilot-pricing contact panel
- [x] **1.4** Three placeholder projects and the `design` / `motion` filter chips removed
- [x] **1.5** Testimonials section deleted (and the now-orphaned `TestimonialCard.astro` with it)
- [x] **1.6** `src/pages/404.astro` added
- [x] **1.7a** Vercel Web Analytics installed — `@vercel/analytics@2.0.1`, official `@vercel/analytics/astro` component in `Layout.astro`. Ahrefs deferred to post-launch (see below)
- [x] **1.7b** **No CSP change needed.** Vercel proxies both halves same-origin — script from `/_vercel/insights/script.js`, events to `/_vercel/insights/view` — so the existing `script-src 'self'` / `connect-src 'self'` already cover it. `vercel.json` is untouched
- [x] **1.7c** `privacy.astro` §5 updated: Vercel Web Analytics disclosed as cookieless and IP-anonymised, with the no-tracker / no-cookie-banner statement rewritten to match
- [ ] **1.7d** **Enable Web Analytics in the Vercel dashboard** (Project → Analytics), then confirm on the deployed preview that `/_vercel/insights/script.js` returns 200 and a pageview lands. The component is inert until the dashboard toggle is on
- [x] **8** DowntownDry accuracy reconciled to 97% across all four locations
- [x] Rebuild — zero `[TODO` in `dist/client/**/*.html`; the two remaining source TODOs are now `{/* */}` comments that do not ship

### Phase 2 — Credibility and correctness

- [x] **7.7** RecycleOldTech stat block replaced with four verified figures; featured copy rewritten around the Bing finding; "Key Result" now cites rankings rather than unverified revenue
- [x] **4.1** Skip link added in `Layout.astro`, `id="main"` on `<main>`
- [x] **4.2** `aria-expanded` / `aria-controls` on the nav toggle, state synced in the handler, Escape closes and restores focus
- [x] **5.2** `width`/`height` added to `ProjectCard`, `TeamMember` and the `/work` featured screenshot — images missing dimensions down from 42 to 19
- [x] **2.1** Three 2024 filler posts deleted. `/blog` keeps its infrastructure and gains a real empty state; the category filter and grid hide themselves while `posts.length === 0`. `/blog` excluded from the sitemap and dropped from `llms.txt` until a post ships — the filter in `astro.config.mjs` carries a note saying to remove `|blog` at that point
- [x] **2.2** All seven Pexels images gone. `/services` detail sections now carry a typographic **spec plate** listing the real stack per service — information rather than decoration, no third-party request, and on-brand via crop marks and mono labels. `/about` uses the commissioned mascot instead of a stock photo of strangers standing in for a two-person studio
- [x] **7.1** **All unverified affiliate claims removed sitewide.** The 8.08% figure had survived in six further places after the `/work` fix — the homepage `AnimatedStats` headline stat, two homepage project descriptions, the `/work` project card, and twice on `/about` (including a `4x Industry Conversion Avg` tile and a stray `100% AI verification accuracy` that contradicted the 97% reconciliation). Each is now a verified first-party figure. Pull the real Associates numbers if you want them back
- [x] **5.2** Images missing dimensions: **42 → 0**, closed out by 2.1 and 2.2 as predicted
- [ ] **2.4** Resolve `foundingDate: 2026` against the "8+ years" copy on `/about`

### Phase 2.5 — Scan funnel (new, from §9)

- [x] **9.2** `/scan` added to the navbar (fifth item, mobile menu inherits it) and the footer Services column
- [x] **9.2** Scan CTAs added to `/services/wordpress`, `/services/agent-ops`, `/services`, `/work` and `/thank-you`
- [x] **9.2** `/thank-you` primary CTA repointed from `/blog` to `/scan` — it was sending people to the three filler posts queued for deletion in 2.1
- [x] **9.1** Post-result "Email me this report" capture built under `#scanResults`, backed by Resend. See §11
- [ ] **9.1** **Move scan rate limiting to shared state — BLOCKED, needs one command from you.** See below

#### Rate limiting: blocked on provisioning

This is the one item that could not be completed, and it is the one that matters most, because the limit it protects is the **per-target** one — the scan makes ~30 requests to whatever site is submitted, so an unthrottled endpoint is a small DDoS amplifier pointed at a third party who never opted in.

Current state: `src/pages/api/scan.ts` holds both limiters in module-level `Map`s. Per-instance, reset by cold starts. `docs/creative-bandit-ai-readiness-scan.md` already called this "a speed bump, not the §6 requirement… Shared state is needed before this is linked publicly." **Every page now links to it**, so that condition is met and the gap is live.

The fix needs a shared store. Upstash Redis is the right one — `@upstash/ratelimit` implements exactly this sliding window, and the Vercel Marketplace install wires the env vars automatically:

```bash
vercel integration add upstash/upstash-kv --yes
npm install @upstash/redis @upstash/ratelimit
vercel env pull --yes
```

I was blocked from running the first command — provisioning a billable resource on the team account needs your approval. Run it (or approve the permission) and the code change is quick: swap the two `Map`s for two `Ratelimit` instances, keeping the existing window and both limits.

```ts
const bySource = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '60 s'), prefix: 'scan:src' });
const byTarget = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '60 s'), prefix: 'scan:tgt' });
```

Nothing else in the route changes — the per-target check must stay **before** `runScan`, so a rejected request still costs the target nothing.

**Worth pairing with it:** a Vercel WAF rate-limit rule on `POST /api/scan`. That runs at the edge before the function is invoked, so it absorbs the per-source case for zero compute. It cannot replace the per-target limit — the target is in the request body, which the WAF cannot read — so the two are complementary, not alternatives.

**Until one of these lands, treat the scan as soft-launched:** it is safe to have live, but do not promote it anywhere with real reach.

**Coverage after this pass** — verified against the build. Baseline of 3 links per page is navbar (desktop + mobile) plus footer; pages with a dedicated CTA carry 4 or more:

| Page | `/scan` links |
|---|---|
| `/` | 6 |
| `/404`, `/services`, `/services/wordpress`, `/services/agent-ops`, `/work`, `/thank-you` | 4 |
| every other page | 3 |

Previously: homepage and 404 only.

### Post-launch — Ahrefs Web Analytics

Deferred deliberately; Vercel first. When it goes in:

- [ ] Create the Web Analytics project for `creativebandit.studio` in the Ahrefs UI
- [ ] Add the script tag with the site key (public, safe to commit — same class as the Web3Forms key)
- [ ] **Add `https://analytics.ahrefs.com` to BOTH `script-src` and `connect-src` in `vercel.json`.** Unlike Vercel's, this one is genuinely third-party. Miss either directive and it fails silently in production while working fine in `astro dev`, which serves no CSP at all — the note is repeated in `Layout.astro` at the call site
- [ ] Add Ahrefs to the third-party list in `privacy.astro` §5

Worth doing: Ahrefs is the only one of the two that breaks out an `llm` source channel, and assistant referrals are the metric this studio sells against (§7.4 — RecycleOldTech shows 690 of them).

### Phase 3 — Performance and polish

**Note:** 5.1 closed itself. Removing `ExitPopup` took the React runtime off 14 of the 15 pages — verified in the rebuild, `client.*.js` now loads on the homepage only (for `AnimatedStats`), saving ~57 KB gzipped everywhere else.


- [ ] **5.3** Self-host and subset the three font families; drop `fonts.googleapis.com` / `fonts.gstatic.com` from the CSP
- [ ] **5.1** ~~Move React off every page~~ — done as a side effect of 1.2
- [ ] **3.1** Author 3–4 OG image variants and pass them via the existing `ogImage` prop
- [ ] **4.4** Add `aria-pressed` and an `aria-live` count to the `/work` and `/blog` filter chips
- [ ] **4.5** Decide the `ink-hot` text policy — lift it, or restrict it to large text
- [ ] **4.6** Make the footer mascot `aria-hidden` and stop it swallowing clicks
- [ ] **3.3** Add `og:image:alt` and `twitter:image:alt` to `Layout.astro`
- [ ] **5.5** Re-encode the two portraits and the project screenshots at delivered size
- [ ] **3.2** Compress `og-image.png` (271 KB → target <100 KB)
- [ ] **2.5** Consider dropping `<meta name="keywords">`

### Phase 4 — Post-launch

- [ ] Run the studio's own `/scan` against `creativebandit.studio` once live and fix anything it reports — it is the product, and the site has to pass it
- [ ] Lighthouse / PageSpeed on the production deploy; capture a baseline
- [ ] Verify the OG cards render correctly in Slack, LinkedIn and X
- [ ] Submit the sitemap to Google Search Console **and Bing Webmaster Tools** — the RecycleOldTech data (§7.2) is a strong argument that Bing is not optional
- [ ] Revisit `script-src 'unsafe-inline'` with nonces or hashes
- [ ] **7.6** Ticket the RecycleOldTech `/claim` page — 3,354 visitors at 99.65% bounce

---

## Appendix — Ahrefs sources

All figures pulled 2026-08-18 via the Ahrefs MCP API.

| Data | Endpoint | Target |
|---|---|---|
| Monthly visitors, pageviews, bounce, session | `web-analytics-chart` / `web-analytics-stats` | project `8362376` (verified, first-party) |
| Channel mix | `web-analytics-source-channels` | project `8362376` |
| Search engine split | `web-analytics-referrers` | project `8362376` |
| Top pages | `web-analytics-top-pages` | project `8362376` |
| Organic traffic estimate | `site-explorer-metrics-history` | `recycleoldtech.com`, subdomains |
| Keyword position bands | `site-explorer-keywords-history` | `recycleoldtech.com`, subdomains |
| Ranking keywords | `site-explorer-organic-keywords` | `recycleoldtech.com`, US |
| Domain Rating | `site-explorer-domain-rating-history` | `recycleoldtech.com` |
| Backlinks | `site-explorer-backlinks-stats` | `recycleoldtech.com`, subdomains |

**Caveats.** Web Analytics figures are first-party and authoritative, but begin May 2025 — there is no data for the first four months of the requested 18-month window because the tag did not exist. August 2026 is partial (1st–18th). Site Explorer traffic and keyword figures are Ahrefs *estimates* derived from a Google-centric model and, as §7.2 shows, understate this particular site badly; use them for trend and ranking counts, never as traffic. Channel visitor counts sum slightly above the unique-visitor total because one visitor can arrive through more than one channel within the window.

---

## 11. Email — Resend

Added 2026-08-18. Two flows, one vendor, one API key, one entry in the privacy policy.

**On "Loops":** it appears nowhere in this repo or any doc, and never has. The written plan was always **Resend** — `docs/creative-bandit-ai-readiness-scan.md` §2.4 lists it against "Report email", and §9.3 records it as "the default suggestion; nothing is chosen". Resend is also the only product in the Vercel Marketplace `messaging` category. Choosing it closes that open decision.

Also closed: scan doc §9.4 asked "Is the scan gated on email? Current spec: yes, because the report is emailed." That is now decided the other way, matching what shipped — findings free and ungated on screen, email offered afterwards for a forwardable copy. §9.1 above has the reasoning.

### What was built

| Piece | File | Notes |
|---|---|---|
| Resend client | `src/lib/email/client.ts` | Lazy — `new Resend(undefined)` throws, and these import at build time |
| Payload signing | `src/lib/email/signature.ts` | HMAC-SHA256 over `{url, findings}` |
| Report template | `src/lib/email/reportTemplate.ts` | Table layout, light ground, HTML + plain-text |
| Report endpoint | `src/pages/api/scan-report.ts` | Verifies signature before sending |
| Signup endpoint | `src/pages/api/subscribe.ts` | Writes to a Resend Audience |
| Signup UI | `src/components/SubscribeForm.astro` | Footer sitewide + blog empty state |
| Report UI | `src/pages/scan.astro` | Under `#scanResults`, after findings |
| Shared limiter | `src/lib/rateLimit.ts` | Extracted from `api/scan.ts`; all three routes share it |

### Why the report is signed

`/api/scan-report` takes findings from the browser and mails them from our domain to an address the browser also supplies. Unsigned, that is an **open relay with our sending reputation attached** — anyone could POST arbitrary text and have it arrive as a Creative Bandit report. A phishing kit, not a feature.

Three ways to close it:

- **Re-run the scan server-side.** Unspoofable, but doubles compute and third-party requests, and would collide with the per-target rate limit that just rejected a second scan of the same host within a minute.
- **Persist the result, pass an id.** Correct, but no datastore is provisioned.
- **Sign the payload.** Stateless, no extra fetches, no storage. Chosen.

`/api/scan` now returns a `signature` alongside the result; the report endpoint recomputes it and refuses any mismatch. If `SCAN_REPORT_SECRET` is unset the endpoint returns 503 rather than sending something it cannot vouch for.

### Setup — status

Provisioned 2026-08-18. Resource `resend-email-purple-grass`, free plan (3,000/month, 100/day), connected to the `creative-bandit` project.

| Step | State |
|---|---|
| Marketplace terms accepted | Done |
| Integration installed + connected | Done — injects `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN` |
| `SCAN_REPORT_SECRET` generated and set | Done — all three environments |
| `RESEND_AUDIENCE_ID` set | Done — reuses the existing "General" audience |
| `vercel env pull` | Done |
| **Sending domain verified** | **NOT DONE — blocks all sending** |

#### The one remaining step: DNS

`creativebandit.studio` is registered in Resend but sits at `status=not_started` — no DNS records added. **Until this is done the API accepts sends and the mail silently bounces.** Nameservers are Google Cloud DNS (`ns-cloud-c*.googledomains.com`), not Vercel, so these have to be added there by hand:

| Type | Name | Value | Priority |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXkOoMhMw0fxXFDjukL3VPY459S6HofyeYjtAW41L7znU8Onh0TBeene3CxJNFlQXcMydRfEHBU5i2lonY3YHphtboLB1o5Gsea572y+BBWh2rVTOTSgr8zVamsY02XAtGFnxM441+yD6rR0DXj6Ow7ZAk+gHfHn5br4+psyDBqQIDAQAB` | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

Then hit Verify in the Resend dashboard and send one real report to yourself before relying on it.

**These records are also written up on their own in `docs/go-live-dns.md`**, alongside the Vercel domain cutover and a post-cutover checklist. The domain is staying parked until launch by choice, so that doc is the single place to look when it is time.

### Environment variables

| Var | Secret? | Source | Without it |
|---|---|---|---|
| `RESEND_API_KEY` | **Yes** | Marketplace install | Both endpoints 503 |
| `RESEND_AUDIENCE_ID` | No | Resend dashboard | Signup 503s; report unaffected |
| `SCAN_REPORT_SECRET` | **Yes** | Generate | Report 503s; scan and signup unaffected |

None are `PUBLIC_` — unlike the Web3Forms key and the analytics site key, `RESEND_API_KEY` can send mail as our domain. That is why sending happens in API routes and never from the browser. Verified: no secret name appears anywhere in `dist/client`.

**No CSP change needed.** Both endpoints are same-origin, so `connect-src 'self'` covers the browser side, and Resend is only ever called server-side.

### Deliberately not done

- **No lead-magnet PDF offer.** The "AI Automation Readiness Checklist" the old exit popup promised still does not exist. The signup asks for an email and says what will be sent — nothing more. Add the offer to `SubscribeForm.astro` and the delivery to `/api/subscribe` when the PDF is written.
- **No welcome email on signup**, for the same reason: nothing to send yet.
- **No success state without a 2xx.** The popup this replaces set `submitted` unconditionally and told people they had subscribed when the request had failed. Both new forms only report success on a real 2xx.

### Verified by test

- `subscribe` honeypot returns 200 without creating a contact; malformed address returns 400; a real address creates a contact (confirmed against the live API, then removed — the audience is back to 0).
- `scan-report` rejects a forged report — findings rewritten to "Your account is suspended / Send bitcoin" against a genuine-looking body — with a 400, before any network call.
- Signature unit tests at `src/lib/email/signature.test.ts`, 7 cases. Full suite: **143 tests, 8 files, all passing**.

**A real bug was found and fixed in the process.** `verifyScan` compared the *string* length of the supplied signature against the expected one, then decoded both with `Buffer.from(sig, 'hex')`. But `Buffer.from` stops at the first non-hex character and returns a short buffer rather than throwing — so a 64-character signature made entirely of non-hex characters decoded to zero bytes, and `timingSafeEqual` threw `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`. Since `verifyScan` is called outside the endpoint's try block, that surfaced as a **500 instead of a clean 400**.

Not a bypass — it failed closed and sent nothing — but it was a crash path reachable by anyone, and the original code comment claimed to have handled exactly this case while not actually doing so. Now shape-checked with `/^[0-9a-f]{64}$/i` before any decoding, with a regression test that sends that precise input.

### Still open

- The new endpoints inherit the **in-process rate limiter** (§9.2). `reportRecipient` caps one address at 2 reports/hour, which blunts inbox-bombing, but like the rest it resets on cold start. The Upstash swap now fixes all three routes at once, since they share `lib/rateLimit.ts`.
- **`creativebandit.studio` is not attached to the Vercel project.** It resolves to `68.66.210.129`, which is not Vercel, and it appears in neither `vercel domains ls` nor the project's aliases — it is still parked, as the scanner doc noted back in July. Unrelated to email, but it is a launch blocker in its own right and worth handling in the same DNS sitting.

> **Note on local testing.** Outbound fetch from the Astro dev server is blocked in this sandbox, so `subscribe` returns 502 locally with `Unable to fetch data`. The identical call succeeds from plain Node against the same key, so this is an environment artifact, not a code fault. Verify on a Vercel preview deployment rather than locally.
