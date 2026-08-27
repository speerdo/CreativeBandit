# Launch readiness pass

`adam-launch-readiness-pass` → `main` · 27 files, +1036 / −725

Pre-launch audit of the whole site — SEO, Open Graph, accessibility, performance, measurement and content credibility — plus the fixes. Full findings and the remaining plan are in `docs/creative-bandit-launch-readiness.md`.

The technical SEO foundation was already good (absolute canonicals, one `<h1>` per page, real JSON-LD entity nodes, sitemap, RSS, `llms.txt`, strict CSP). What blocked launch was placeholder content and broken lead capture shipping to production.

## Launch blockers fixed

- **Contact form was dead** — `access_key` was literally `YOUR_ACCESS_KEY`, so the only contact route on the site silently failed. Real key in place.
- **Exit popup was discarding emails** — posted to `YOUR_KIT_FORM_URL` and set its success state unconditionally, so visitors saw a confirmation that was false. It also promised a lead-magnet PDF that doesn't exist. Component removed.
- **`[TODO: $/mo]` in the live Agent Ops pricing table** — replaced with a pilot-pricing panel.
- **Three fake portfolio projects** with stock photos and `link: '#'` — the only entries under the Design and Motion filters. Removed, along with those two filter chips.
- **Placeholder testimonials** under a heading reading "Trusted By Real Clients". Removed.
- **No 404 page** — added, with routes to home, work, services and the scan.
- **No analytics at all** — Vercel Web Analytics added.

## Content credibility

The `8.08% affiliate conversion` claim, plus `$300+/mo revenue` and `1,000+ monthly referrals`, could not be substantiated from anything a reader can check — they live in Amazon Associates and an ad network. They appeared in **seven** places including the animated homepage headline stat. All replaced with verified first-party figures pulled from Ahrefs (Web Analytics + Site Explorer, 2026-08-18):

| Was | Now |
|---|---|
| 8,000+ monthly visitors | **10,000+** (trailing-12 actual: 10,585) |
| $300+ monthly revenue | **85** top-10 rankings |
| 8.08% affiliate conversion | **455** referring domains |
| 1,000+ monthly referrals | **690** visitors from AI assistants |

Notably the traffic figure was *understated*. Also reconciled DowntownDry's accuracy, which was claimed as both 97% and 100% roughly 200 lines apart on the homepage.

One finding worth reading in the doc (§7.2): Ahrefs estimates RecycleOldTech at ~200 organic visits/month while first-party analytics records ~10,600. The gap is that Ahrefs models Google, and **87.5% of that site's search traffic comes from Bing-family engines** — the same index behind Copilot and ChatGPT. That's now the featured copy on `/work`.

## Content cleanup

- Deleted three filler blog posts dated March 2024 (one titled *"Trends to Watch in 2024"*). `/blog` keeps its infrastructure and RSS, gains a real empty state, and is excluded from the sitemap and `llms.txt` until a post ships.
- Removed all seven hotlinked Pexels stock images. `/services` detail sections now carry a typographic spec plate listing the real stack per service; `/about` uses the commissioned mascot.

## Accessibility

- Skip link + `id="main"` — every page had a fixed header with five controls before any content.
- Nav toggle: `aria-expanded` / `aria-controls`, state synced in the handler, Escape closes and restores focus.
- Removing the exit popup also removed an un-labelled modal with no `role="dialog"`, focus trap or Escape handler.

## Performance

- **React runtime dropped from 15 pages to 1** (~57 KB gzipped saved per page) — it was loading everywhere solely for the broken popup.
- Images missing intrinsic dimensions: **42 → 0**.

## Scan funnel

`/scan` was reachable only from the homepage, while every internal page pushed the higher-friction `/contact` — backwards for what the homepage calls "start here". Added to the navbar and footer, plus dedicated CTAs on `/services`, `/services/wordpress`, `/services/agent-ops`, `/work` and `/thank-you`. All 13 pages now link to it.

`/thank-you`'s primary CTA also moved off `/blog`, which pointed at the posts deleted here.

**Decision recorded (doc §9.1): the scan stays ungated.** Requiring an email would contradict published copy in four places, and the ungated run is the differentiator. Capture should come *after* the findings render — higher intent, and it matches a need the copy already names (agencies want to forward the report to their client). Not built here.

## Not in this PR

- ⚠️ **Scan rate limiting is still in-memory and per-instance.** This is the one real gap: the per-target limit is what stops the scanner being used as a DDoS amplifier (~30 requests per scan against a third-party site). Needs `vercel integration add upstash/upstash-kv` — provisioning was blocked pending approval. **Treat the scan as soft-launched until it lands**, especially now that every page links to it. Exact fix in doc §9.2.
- Enable Web Analytics in the Vercel dashboard — the component is inert until that toggle is on.
- Send a live submission through the contact form to confirm delivery and the `/thank-you` redirect.
- Remaining Phase 3 items (self-hosted fonts, per-page OG images, `ink-hot` contrast policy) are listed in the doc.

## Verification

`npm run build` clean. Across all 13 pages: 0 TODOs, 0 Pexels references, 0 images missing dimensions, 0 instances of the unverified claims. Sitemap contains 10 real pages with `/blog`, `/thank-you` and `/404` correctly excluded.
