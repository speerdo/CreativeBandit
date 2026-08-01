# Creative Bandit — AI Readiness Scan

**Status:** Phase 2 shipped 2026-07-31: checks 2 (schema), 4 (llms.txt), 5 (metadata) and 7 (feeds/API) are live, on top of Phase 1's check 1 and check 6. Phases 3–5 outstanding.
**Date:** 2026-07-31
**Blocks:** homepage copy that is already live-ready on `kat-design-updates`

> **Build notes — what shipped, and where it departed from this document.**
>
> - **Synchronous, not a job queue (§2.2).** With only check 1 running, a scan
>   completes in well under a second on a healthy site, so `/api/scan` is a
>   plain request/response and there is no database yet. The job model becomes
>   necessary in phase 2, when page sampling lands.
> - **A reachability precheck was added**, and it is not in the original plan.
>   A parked domain resolves fine but answers nothing, and without the
>   precheck the scan burned 14 seconds timing out and then reported "No
>   robots.txt" as an opportunity — which reads as *your site is fine, just add
>   a file* about a site that is not responding. Found by scanning
>   `creativebandit.studio`, which is currently parked.
> - **Rate limiting is in-memory**, therefore per-instance and reset by cold
>   starts. It is a speed bump, not the §6 requirement. Shared state is needed
>   before this is linked publicly.
> - **UA emulation defaults to the compound string** (§3.1). `SCANNER_EXACT_UA=1`
>   switches to exact bot UAs. Still needs the decision in §9.1.
> - **Address pinning has a residual TOCTOU window.** We validate every resolved
>   address and re-validate every redirect hop, but Node's `fetch` performs its
>   own lookup, so closing the gap fully needs a custom agent with a `lookup`
>   hook. The practical redirect-to-metadata attack is blocked; the theoretical
>   race is not.
> - **Unhealthy sites are refused rather than scanned.** Caught by testing
>   against an overloaded `httpbin.org`: it returned 503 to the control *and*
>   to every bot probe, and the report confidently announced "AI crawlers are
>   blocked at the CDN" about a site that was merely down. A 5xx to an ordinary
>   browser now aborts the scan, and the edge probe refuses to judge whenever
>   the control is itself ≥400. Crying wolf is the one failure this product
>   cannot afford (§0.2).
> - **Checks 6 and the directive half of check 1 were added** beyond the
>   original five. See §3.1 half 3 and §3.6.
> - **Stack upgraded to Astro 7 / Tailwind 4** (2026-08-01), which retired the
>   `@astrojs/vercel@9` pin this project used to need. §2.1's "no adapter"
>   description is historical; the adapter is `@astrojs/vercel@11` and
>   `maxDuration: 60` survives the upgrade. The scanner needed no changes.

> **Phase 2 notes.** Six checks now run — crawlers, delivery, feeds, schema,
> metadata, llms.txt — still synchronously (§2.2 stays unbuilt). Measured
> end-to-end: example.com 0.4s, astro.build 1.0s, wpbeginner.com 16.6s. The
> spread is page-fetch time on the origin, not our overhead, and a heavy
> WordPress site sits at the top of it. `maxDuration` is pinned to 60 in
> `astro.config.mjs` against a 45s `SCAN_BUDGET_MS` plus an 8s precheck that
> runs before the budget timer starts — if the budget grows, the function
> ceiling has to grow first. Checks run in two waves: the four that need no page
> bodies run first, then sitemap discovery + up to 24 page fetches at
> concurrency 4, and schema/metadata/images/identity all parse the bodies
> from memory. Phase-2 findings report against the sample, not the whole
> site, and say so out loud. Sitemap sampling is homepage-first, not
> stratified — revisiting if phase 5 shows it skewing to archives.
>
> **Near-duplicate title clustering had to be fixed against a real site.**
> The first pass scored "About – WordPress.org" and "Counter – WordPress.org"
> as the same template because the shared brand suffix drowned the leading
> subject in a character-shingle Dice score. Fix: compare titles after
> stripping a shared trailing suffix, require the brand portion of the
> suffix to match, ignore any one-word remainder, and merge at 0.7 rather
> than 0.65. Verified against wordpress.org (no false positive) and against
> a synthetic Denver/Chicago location template (still catches it).
>
> **Review fixes, 2026-08-01.**
>
> - **`<loc>` CDATA was not unwrapped**, so sitemap discovery returned nothing
>   on most WordPress sites. Both AIOSEO and Yoast wrap the URL in CDATA, and
>   the `[^<]+?` pattern could not match content beginning with `<`. The scan
>   then reported a confident, false "No sitemap exists" *and* silently lost
>   every check that needs the page sample — schema, metadata, images,
>   identity. Found against wpbeginner.com; regression tests in
>   `sitemap.test.ts`. This was the single most damaging bug in the tree,
>   because it failed hardest on exactly the platform the product targets.
> - **The result reported the pre-redirect URL**, so an apex that 301s to www
>   captioned the findings with a host that was never examined.
> - **`maxDuration` was absent** from `astro.config.mjs` — the commit adding it
>   never reached main — leaving the function on a plan default that may sit
>   below the 45s budget. Pinned to 60.
> - **The privacy policy described an emailed report, 90-day retention of URLs
>   and findings, and per-target rate limiting.** None of the three exist:
>   there is no email field, no persistence of any kind, and the limiter is
>   per source address only. Rewritten to describe what the code does. Worth
>   re-reading whenever a check gains a side effect — it is the one document
>   here where over-claiming is a legal problem rather than a copy problem.

---

## 0. Why this exists, and the deadline attached to it

The homepage rewrite put this on the page, twice:

> **Scan a Client Site Free** — No call required. Results in seconds.
> *The scan is free, it takes seconds, and the report is useful whether or not you ever hire us.*

The CTAs now point at `/scan`, and the phase-1 scan returns in roughly a second, so the copy is currently accurate.

**It was "about 90 seconds" until phase 1 shipped**, written against the full five-check budget. With only checks 1 and 6 running it undersold by two orders of magnitude, so it was tightened. That makes it a live constraint again in the other direction: the page-sampling and headless checks in phases 2–3 will push a scan back toward a minute, and **"in seconds" has to be revisited when they land** rather than quietly becoming false.

Two consequences worth stating up front, because they constrain every decision below:

1. **The stated duration is a product requirement, not an aspiration.** It is printed on the page. A check that cannot fit inside the budget gets cut or moved to the emailed report, not allowed to stretch the number — and if the number has to grow, the copy changes with it.
2. **The scan is the top of the funnel for an agency audience.** The reader is a WordPress agency owner evaluating whether we know more than they do. A finding that is wrong, or that reads as generic SEO-tool output, costs more than no scan at all.

The scan's job is to produce *findings about a site they already manage* — per the homepage, "Specific findings, not a grade." The report model below has no letter grade or score out of 100 on purpose.

---

## 1. Product definition

**Input:** one URL, plus an email address to send the full report to.

The homepage promises "No account, no discovery call, no form that asks for your budget range before it tells you anything." Email is the only field beyond the URL, and it is justified because the report is emailed. Do not add fields.

**Output:** a findings list, each tagged one of three ways. This model comes from the mockup in `creative-bandit-homepage.html` and should stay aligned with it:

| Tag | Meaning | Example |
| --- | --- | --- |
| `gap` | Something is broken or blocking. Objective, verifiable. | "GPTBot is blocked in robots.txt" |
| `opportunity` | Nothing is broken, but there is headroom. | "68% of support pages answer repeat questions" |
| `good` | Working correctly. Include these — a report that is all bad news reads as a sales tool. | "Clean URL structure and fast response times" |

**Delivery:** top findings render on screen as they land; the full report is emailed. The mockup footer reads "4 findings · full report emailed · no obligation" — match that.

**Non-goals.** Not a Lighthouse clone. Not a general SEO audit. Not a crawler that maps the whole site. Every check below exists because it changes what an AI assistant can do with the site, and we should be able to say so in one sentence to a skeptical agency owner.

---

## 2. Architecture

### 2.1 The site cannot do this today

`astro.config.mjs` has no adapter and no `output` setting, so the build is fully static. There is no server-side compute in this project at all. That is the first thing to change.

**Recommended:** add `@astrojs/vercel` and keep the marketing site static, opting individual API routes into on-demand rendering with `export const prerender = false`. This preserves the current static build for all 14 pages and adds server routes only where needed. Verify current Astro adapter semantics against the docs when implementing — this area has changed across major versions.

**Rejected:** a separate service on another domain. It doubles deploy surface and CORS config for a feature that is three endpoints.

### 2.2 Job model

A synchronous request/response will not survive the budget or the function timeout. Use a job:

```
POST /api/scan          { url, email }        -> { jobId }
GET  /api/scan/:jobId   (SSE or poll)         -> { status, findings[], progress }
```

Findings stream as they complete rather than landing all at once. This matters for the 90-second claim: a progress UI that shows check 1 resolving in four seconds *feels* immediate, where a 90-second spinner feels broken. Do not batch the response until the end.

### 2.3 Function limits — verify before building

Vercel's maximum function duration depends on plan and on whether Fluid compute is enabled, and the defaults have changed over time. **Confirm the current ceiling for this account before committing to the job design.** If the ceiling is comfortably above 90s, a single function per job is simplest. If not, split: one function per check, fanned out, writing findings to shared storage as they finish.

### 2.4 Storage and email

| Need | Proposal | Notes |
| --- | --- | --- |
| Job + findings state | Neon Postgres | Already available via MCP on this account. Two tables: `scan_job`, `scan_finding`. |
| Raw artifacts (HTML, robots.txt) | Vercel Blob, or skip | Only needed if we want to re-run analysis without re-fetching. Start without it. |
| Report email | Resend | Not yet chosen. See §9. |

### 2.5 Headless rendering

Check 3 requires a real browser. This is the single heaviest dependency in the system and the most likely thing to blow the budget.

- **Do not** bundle full Playwright into a serverless function. Size and cold start make it a poor fit.
- **Option A:** `puppeteer-core` + `@sparticuz/chromium`. No third-party dependency, but cold starts are slow and the setup is fiddly.
- **Option B:** an external render API (Browserless, ScrapingBee, or similar). Costs money per render, but keeps the function slim and the timing predictable.
- **Option C:** Vercel Sandbox, if it fits the latency profile.

**Recommendation: B for v1.** Check 3 is the only check that needs it, it renders 5–8 pages per scan, and predictable latency is worth more than saved pennies while we are proving the funnel works. Revisit once volume is known.

---

## 3. The checks

Eleven checks in total: the original five (§3.1–§3.5), check 6 added in phase 1 (§3.6), checks 7–10 added in phase 2 (§3.7–§3.10), and check 11 deferred (§3.11). Ordered by value to the reader, which is also the order they should resolve on screen.

### 3.1 AI crawler blocking — the headline finding

This is the best single finding in the product. It is binary, objectively verifiable, has a clear remediation, and a meaningful number of agency owners do not know it is true of a site they manage. Get this one right before building anything else.

**The critical insight: there are two independent mechanisms, and robots.txt only catches one of them.**

A plugin default writes `Disallow` rules into robots.txt. A Cloudflare toggle — "Block AI Scrapers and Crawlers", which is one switch in the dashboard and is on by default for some plan tiers — blocks at the edge and **never touches robots.txt**. A scanner that only parses robots.txt will report a clean bill of health on a site that is hard-blocking every AI crawler at the CDN. That is a worse outcome than not running the check.

So the check has two halves.

**Half 1 — parse robots.txt.**

Fetch `/robots.txt`. Implement real group semantics, not a substring search:

- `User-agent` lines accumulate into a group until the first non-`User-agent` line; a group can name several agents.
- A crawler obeys the **most specific matching group only**. If `GPTBot` has its own group, the `*` group does not apply to it.
- Within a group, `Allow` and `Disallow` are resolved by **longest matching path**, with `Allow` winning ties.
- Agent matching is case-insensitive and matches on prefix.
- Handle `/robots.txt` returning HTML (soft 404) — that is "no robots.txt", not "a robots.txt with weird rules".

Agents to check:

| Agent | Operator | What blocking it costs the site |
| --- | --- | --- |
| `GPTBot` | OpenAI | Training + retrieval corpus |
| `OAI-SearchBot` | OpenAI | ChatGPT search results |
| `ChatGPT-User` | OpenAI | User-initiated fetches inside ChatGPT |
| `ClaudeBot` | Anthropic | Training + retrieval |
| `Claude-User`, `Claude-SearchBot` | Anthropic | User-initiated and search fetches |
| `PerplexityBot` | Perplexity | Perplexity answers and citations |
| `Google-Extended` | Google | Gemini grounding — **does not affect Google Search ranking** |
| `Applebot-Extended` | Apple | Apple Intelligence |
| `meta-externalagent` | Meta | Meta AI |
| `CCBot` | Common Crawl | Feeds many downstream training sets |
| `Bytespider` | ByteDance | Frequently blocked deliberately; report but do not alarm |

Two nuances the report copy must get right, or an informed reader will catch us being sloppy:

- **`Google-Extended` is not Googlebot.** Blocking it does not affect search ranking. If we imply it does, we lose the room.
- **Some blocks are deliberate.** A publisher blocking `CCBot` and `Bytespider` on purpose is a legitimate choice. Report the fact; do not moralize. The finding is "here is what is blocked and what that costs you," not "you did this wrong."

**Half 2 — detect edge blocking.**

robots.txt is advisory. Edge blocking is enforcement, and it is invisible to half 1. Issue a small number of live requests and compare against a control:

1. `GET /` with an ordinary browser UA → record status, size, and a body fingerprint. This is the control.
2. `GET /` with each AI bot UA → same.
3. A bot request that returns 403, 503, 429, a Cloudflare challenge interstitial, or a body that diverges sharply from the control is **blocked at the edge**.

Cap this at the homepage plus one interior URL per agent. This is a handful of requests, not a crawl.

> **Decision needed — UA emulation.** Detecting UA-based blocking requires sending the bot's UA string. Sending `GPTBot` when we are not GPTBot is, strictly, spoofing.
>
> **Proposed compromise:** send a compound UA — `Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot) CreativeBanditScanner/1.0 (+https://creativebandit.studio/scanner)`. Most WAF rules match on the substring `GPTBot`, so the detection still fires, and we are not claiming to be OpenAI to anyone reading the log. Fall back to the exact string only if the compound UA measurably fails to detect known-blocked sites.
>
> Constrain this hard regardless: only on domains the requester has attested they manage (§6), only a few requests, never behind auth. Get a human decision on this before shipping — see §9.

**Half 3 — header and meta directives.**

The third mechanism, and the quietest of them. `X-Robots-Tag` on the response, or `<meta name="robots">` in the head, can carry:

| Directive | Effect |
| --- | --- |
| `noindex` / `none` | Excluded from indexing entirely. On a live site this is nearly always a staging leftover — WordPress core has a "Discourage search engines" checkbox that sets it. |
| `nosnippet` / `max-snippet:0` | May be indexed, but **nothing may be quoted from it**. Found and unusable. |
| `noarchive` | No cached copy. |
| `noai` / `noimageai` | Partial opt-out, honoured by some crawlers and ignored by others. |

Why this belongs in the headline check: an `X-Robots-Tag: noindex` is invisible in robots.txt, invisible in the CDN dashboard, and invisible in the page as a browser renders it. Nothing about the site looks wrong.

Two parsing traps, both covered by tests:

- **Only read the `<head>`.** A blog post *about* `noindex` will contain the string in body copy, and an article that trips the check is a finding we have to retract.
- **`max-snippet:0` is not agent-scoped.** The colon makes it look like `googlebot: noindex`, and treating it as a scope loses the directive. `max-snippet:-1` means *no limit* and must not be reported as a block.

**Findings produced:**

- `gap` — "The homepage carries a 'noindex' directive" (weight 120 — the loudest finding in the product when it fires)
- `gap` — "GPTBot, ClaudeBot and PerplexityBot are blocked in robots.txt" (name the agents, quote the rule, give the line number)
- `gap` — "AI crawlers are blocked at the CDN. Your robots.txt looks clean, which is why this is easy to miss." ← *the most valuable single sentence in the product*
- `gap` — "Snippets are suppressed on the homepage"
- `good` — "All major AI crawlers can reach this site." — requires all three mechanisms clear, not just robots.txt.

### 3.2 Structured data coverage

**Sitemap discovery**, in order, stopping at the first that yields URLs: `robots.txt` `Sitemap:` directive → `/sitemap.xml` → `/sitemap_index.xml` (Yoast) → `/wp-sitemap.xml` (WP core) → `/sitemap-index.xml`. Handle sitemap-index recursion one level deep, gzipped sitemaps, and XML that is actually an HTML 404.

If no sitemap exists, that is itself a `gap`. Fall back to a shallow crawl from the homepage, capped, so the rest of the checks still have URLs to work with.

**Sampling.** Do not crawl the site. Take a stratified sample of 25–40 URLs: the homepage, plus URLs spread across path depths and top-level sections, so a 4,000-page site does not sample 40 blog posts and conclude the products have no schema.

**Parse** `<script type="application/ld+json">` (including multiple blocks and `@graph`), microdata (`itemscope`/`itemtype`/`itemprop`), and RDFa. Tolerate malformed JSON — a broken JSON-LD block is a finding, not a crash.

**The insight that makes this check worth running.** Yoast and RankMath emit `WebSite`, `WebPage`, `Organization` and `BreadcrumbList` on essentially every page. A naive "percentage of pages with schema" metric therefore reports **100%** on a typical WordPress site and tells the reader nothing they can act on. Tier the types:

| Tier | Types | Value |
| --- | --- | --- |
| Boilerplate | `WebSite`, `WebPage`, `Organization`, `BreadcrumbList`, `SearchAction` | Plugin default. Near-zero marginal value. |
| Entity | `Product`, `Service`, `Article`, `FAQPage`, `HowTo`, `LocalBusiness`, `Event`, `JobPosting`, `Recipe`, `Review`, `Person` | What actually lets an assistant answer a question about the business. |

Report **both** numbers. The gap between "100% have schema" and "6% have entity schema" *is* the finding, and it is the kind of distinction that signals we know the platform.

Also validate required properties per type — a `Product` with no `offers`, `name` or `price` is present-but-useless, which is its own finding.

**Findings:** `gap` — "No structured data on 34 of 41 pages"; `opportunity` — "Every page carries plugin boilerplate, but nothing describes what you actually sell"; `good` — "Product schema is complete across the catalogue."

### 3.3 Content readable without JavaScript

**Method.** For each of 5–8 sampled pages: fetch raw HTML (no JS), then fetch rendered HTML (headless). Extract main-content text from each — use a Readability-style extraction, not raw `innerText`, so nav and footer boilerplate do not dominate the comparison. Compare.

```
jsRatio = rawContentTokens / renderedContentTokens
```

| `jsRatio` | Reading |
| --- | --- |
| > 0.9 | Fine. Content is in the HTML. |
| 0.5 – 0.9 | Partial. Something meaningful is client-rendered — often tabs, accordions, reviews, or product data. |
| < 0.5 | `gap`. The page is substantially invisible without JS. |
| ~0 with an empty root div | SPA shell. The strongest version of this finding. |

**Why it matters, in the report's words:** most AI crawlers do not execute JavaScript. If the content only exists after hydration, assistants cannot see it — regardless of how good the schema is.

**Calibration note.** A standard WordPress theme will pass this easily, and that is fine — it produces a `good` finding. The check earns its cost on headless WP, React/Vue front-ends, and heavily plugin-driven pages where product data or FAQs are injected client-side. Expect a high pass rate and do not tune the thresholds to manufacture failures.

This is the most expensive check. If the budget is at risk, this is the one that degrades first — drop to 3 pages before dropping any other check.

### 3.4 llms.txt presence

Fetch `/llms.txt` and `/llms-full.txt`.

**Soft-404 detection is the whole difficulty here.** Many WordPress sites return the themed 404 page with a `200` status. Guard with: status is 200, `Content-Type` is not `text/html`, body does not start with `<!DOCTYPE`/`<html`, and body does not match the response from a known-bogus control path (`/_cb_scan_probe_404`). Only then call it present.

If present, sanity-check the shape: an H1, and at least one markdown link.

**Report honestly.** Adoption of `llms.txt` by actual crawlers is currently limited, and an agency owner who knows that will discount everything else in the report if we oversell it. Frame it as low-cost positioning, not as a fix for a live problem:

> `opportunity` — "No llms.txt. Adoption is still early and no major assistant requires one, but it is a 20-minute job and it puts you ahead of essentially every competitor in this space."

Almost nobody has one, which makes this an easy, honest recommendation and a good `opportunity`-tagged item to balance the report.

### 3.5 Metadata quality and uniqueness

Across the same sample as §3.2. Per page: `<title>`, `meta description`, `canonical`, `og:title`/`og:description`/`og:image`, `h1` count.

**Checks:**

| Check | Threshold |
| --- | --- |
| Title present | Required |
| Title length | ~30–60 chars; flag outliers, do not be dogmatic |
| Description present | Required |
| Description length | ~70–160 chars |
| Canonical present and self-referential | Flag cross-domain or mismatched canonicals — these are usually a migration scar |
| `h1` count | Exactly 1; flag 0 or 3+ |
| OG tags present | Required for social/assistant preview |

**Uniqueness** is the part generic tools do badly. Exact duplicates are easy; the common WordPress failure is *near*-duplicates — "Services | Agency", "Services - Chicago | Agency", "Services - Denver | Agency" — produced by a template or a location-page plugin. Use normalized shingling or a similarity ratio, cluster the near-duplicates, and report the cluster with examples rather than listing 40 individually.

**Findings:** `gap` — "18 pages share 3 title templates"; `gap` — "11 pages have no meta description"; `good` — "Titles and descriptions are unique across the sample."

### 3.6 Delivery and hygiene

Added after the original five. Splits into two halves with very different justifications, and the split is the point.

**On-thesis: fetchability.** A crawler that cannot resolve a canonical host, or that burns its budget on redirects, never reads the site. This is an AI readiness problem wearing an infrastructure hat.

| Item | Finding |
| --- | --- |
| No HTTP→HTTPS redirect | `gap`. Crawlers increasingly distrust plain HTTP. |
| Redirect chain ≥3 hops | `gap`. Some crawlers stop following before the end. |
| Both `www` and apex serve 200 independently | `gap`. Two full copies of the site, splitting ranking and citation signals. Common WordPress misconfiguration, one extra request to detect. |

**Off-thesis, included deliberately: security headers.** HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.

None of these affect what an assistant can do with the site, and §1 lists "not a general SEO audit" as a non-goal. They are in anyway because they are cheap to check and clients ask about them — but the framing is load-bearing:

- **One finding, never five.** Reported as "3 of 5 common security headers are missing", with the list as evidence.
- **Weight 5**, below every AI finding including the good news, so it always lands last.
- **The detail line says so out loud**: *"Not an AI readiness problem, and included here only because it is cheap to fix and clients ask about it."*

The risk being managed: every free scanner reports these. Leading with them, in front of an audience specifically evaluating whether we know more than they do, would make the report look like securityheaders.io with extra steps. Bottom of the page, honestly labelled, it costs nothing and answers a question the reader was going to ask.

### 3.7 Feed and API surface discovery

Added in phase 2. Agency owners routinely do not know these endpoints exist, and they are the cleanest way for an assistant to read the site without scraping.

**Detection.** On the already-fetched homepage, look for:

| Signal | Where | What it means |
| --- | --- | --- |
| `<link rel="alternate" type="application/rss+xml">` | `<head>` | RSS/Atom feed. |
| `href=".../feed/"` or `/feed.xml` or `/rss.xml` | `<head>` or link tags | Same. |
| `rel="https://api.w.org/"` | `<head>` or HTTP `Link` header | WordPress REST API is on. |
| `<meta name="generator" content="WordPress ...">` | `<head>` | Confirms WP; also tells us which sitemap path to try first in §3.2. |

If the REST API is detected, do **not** probe it further in v1 — the point is "your content is already machine-readable," not an API reconnaissance exercise.

**Findings:**

- `opportunity` — "This site already has a WordPress REST API or RSS feed. An assistant can read it directly — no screen-scraping needed." Detail: mention the REST API is often enabled by default and most owners have never seen it.
- `good` — omitted; absence of feeds is not a gap, only a missed convenience.

The insight worth printing: "The REST API is how an AI assistant can answer questions about your business accurately — with prices, hours, and services pulled live rather than guessed from a cached snapshot. It is probably already on, and you have never used it for anything."

### 3.8 Image AI-accessibility

Added in phase 2 as a sub-check inside the §3.5 metadata pass (the sample pages are already parsed, so there is no fetch cost). Kept as a separate finding family because the remediation is image-specific.

**Checks on the sample:**

- `<img>` tags with missing or empty `alt`. A meaningful number of WordPress galleries ship like this — the page builder focuses on layout, not text alternatives. Assistants doing multimodal grounding cannot see what the image shows.
- Key business imagery delivered as CSS `background-image` rather than `<img>` — logo walls, team photos, portfolio pieces. Invisible to a text-first crawler and invisible to an assistant that can see images.

**Findings:**

- `gap` — "N of M sampled images have no alt text" (only if the count crosses a floor — one missing alt is not news).
- `opportunity` — "Your portfolio / team / location imagery is delivered as CSS backgrounds, so nothing can see it. Moving key images to real `<img>` tags with alt text also improves accessibility, which is a free win."

**Framing note.** This is not an accessibility audit; do not grade. It is about what an AI assistant can *see*, which is on-thesis.

### 3.9 Organisation identity consistency (NAP)

Added in phase 2. The question is whether the site tells an assistant, unambiguously, *which business this is*.

**Look for:**

- `Organization` / `LocalBusiness` JSON-LD with a `name`, on the homepage.
- The `<title>` of the homepage.
- An `h1` on the homepage.
- Any visible footer / contact page business name.

**The failure mode worth reporting:** business name present in title or h1, but no `Organization` schema at all, or `Organization` schema with a `name` that does not match the visible brand (very common when the site was built from a theme demo and the schema was never updated). An assistant grounding a "who are these people" answer will pick whichever string it found last, and it may pick wrong.

**Findings:**

- `opportunity` — "This site does not tell an assistant which business it belongs to." Detail: no Organization/LocalBusiness schema, or schema name does not match the brand in the title/h1. Remediation: a five-minute JSON-LD block in the footer, or the SEO plugin's knowledge-graph settings.
- `good` — omitted. Only report the mismatch.

This is deliberately lighter than a full GBP/citation cross-reference — that belongs in the paid audit, not a free scan.

### 3.10 Platform fingerprint

Added in phase 2, but deliberately muted — not a finding in its own right. The homepage body we already have contains `<meta name="generator">` tags, `wp-content` paths, and `X-Powered-By` headers. Record what the site is (WordPress version, page builder, theme) and use it to shape remediation copy elsewhere: "in Yoast, turn on X" reads as expertise; "check your settings" reads as every other tool.

**Rule:** never report "you are running WordPress 6.4" as a gap. That is security-scanner behaviour and it is off-thesis. The fingerprint is intelligence for the rest of the report, not content for it.

### 3.11 AI licensing signals — deferred

`ai.txt`, `X-AI-License`, `noai`/`noimageai` opt-outs. Partially covered by check 1 half 3 (noai/noimageai directives). A standalone `ai.txt` proposal has essentially zero adoption today, and recommending it as a gap would sell a file format rather than solve a client problem. Revisit if the `llms.txt` framing in §3.4 changes or if a client asks specifically about AI licensing posture.

---

## 4. Finding schema

One shape for every check, so the UI and the email template never special-case.

```ts
interface Finding {
  id: string;                    // stable slug, e.g. 'robots-ai-blocked'
  check: 'crawlers' | 'schema' | 'js-content' | 'llms-txt' | 'metadata' | 'delivery' | 'feeds';
  tag: 'gap' | 'opportunity' | 'good';
  title: string;                 // one line, specific, numbers not adjectives
  detail: string;                // 1-2 sentences: what it means for them
  evidence?: {                   // never assert without showing the receipt
    quote?: string;              // the actual robots.txt line, the actual title
    source?: string;             // URL it came from
  };
  affectedUrls?: string[];       // capped at 10 in UI, full list in email
  remediation: string;           // what to actually do about it
  weight: number;                // display ordering only — NOT summed into a score
}
```

`weight` orders the list. It is deliberately **not** aggregated into a score: the homepage promises "specific findings, not a grade," and a numeric score invites arguing with the number instead of fixing the problem.

**Ordering:** all `gap` by weight, then `opportunity` by weight, then `good`. Show 4 on screen — matching the mockup — with the rest in the email.

---

## 5. The budget

Phase 1 ("in seconds," ~10s) is intact. Phase 2 pushed a healthy WordPress scan to **25–35s** — still under a serverless timeout, still "seconds," but the number is now a live constraint again in the direction §0 warned about. The 90-second ceiling is the original headroom for when phase 3's headless renders land; do not spend it early.

| Phase | Budget | Notes |
| --- | --- | --- |
| Resolve, validate, SSRF checks | 2s | §6 |
| robots.txt + edge probes (§3.1) | 8s | Parallel across agents. First findings on screen here. |
| Sitemap discovery + sampling | 3s | Measured fast on real sites (see phase 2 notes) |
| Fetch sample pages (raw, ≤24) | 2–15s | Concurrency 4 — the phase-2 long pole; measured 3s on wordpress.org |
| Schema + metadata + feeds parse (§3.2, §3.5, §3.7, §3.8, §3.9) | ~0s | CPU-bound on already-fetched bodies |
| llms.txt + soft-404 probe (§3.4) | 2s | Same-origin probe only; HEAD would be unreliable |
| Headless renders (§3.3) | 35s | Phase 3 — the budget's eventual spender |
| Assemble, persist, queue email | 5s | Phase 4 |
| **Phase 2 total** | **~3–15s** | Measured: wordpress.org in 3.1s, example.com in 0.35s |
| **Phase 3+ total** | **~70s** | |

**Degradation, in order, on overrun:** cut the page sample to 12 → cut headless renders to 3 pages → drop §3.3 → shrink the page sample to 8. Never drop §3.1; it is the product.

**A partial report is a success, not a failure.** If the budget expires, return what completed with a clear note about what did not, and say so in the email. Never hold the whole report hostage to one slow check.

---

## 6. Security — read this before writing the fetch layer

We are building an endpoint that takes an arbitrary URL from an anonymous user and makes server-side requests to it. **That is a textbook SSRF vector** and it is the single largest risk in this feature.

Mandatory:

- **Resolve DNS first, then validate the resolved IP, then connect to that pinned IP.** Validating the hostname alone is defeated by DNS rebinding.
- **Block** private ranges (`10/8`, `172.16/12`, `192.168/16`), loopback, link-local (`169.254/16` — this is the cloud metadata endpoint, `169.254.169.254`), IPv6 ULA/link-local, and `.internal`/`.local` suffixes.
- **Scheme allowlist:** `http`, `https`. Nothing else — no `file:`, `gopher:`, `ftp:`.
- **Cap redirects** (max 3) and **re-validate the resolved IP on every hop**. A permitted host redirecting to `169.254.169.254` is the classic bypass.
- **Cap response size** (~2MB) and read with a hard timeout. Stream and abort; do not buffer an unbounded body.
- **Content-type allowlist** for parsing: HTML, XML, plain text, JSON.

Also required:

- **Ownership attestation.** A checkbox: "I manage this site or have permission to scan it." Store it with the job. This is what makes §3.1's UA emulation defensible.
- **Rate limits.** Per IP and per target domain. A free unauthenticated scanner is otherwise a DDoS amplifier pointed at whatever domain an attacker types in.
- **Politeness.** Max ~2 concurrent requests per target domain, identify with a real UA and a contact URL, and respect `Crawl-delay` where present. We are about to publish findings about crawler etiquette; ours has to be clean.
- **No auth-walled content.** No cookies, no credentials, ever.
- **Domain denylist** for our own infrastructure.

---

## 7. Data and privacy

| Data | Retention | Note |
| --- | --- | --- |
| Scanned URL, findings | 90 days | The report is the deliverable; keep it long enough to re-send |
| Email address | Until unsubscribe | This is a marketing list. It needs an unsubscribe link and a privacy-policy line. |
| Raw fetched HTML | Do not persist in v1 | Only add if re-analysis without re-fetching becomes necessary |

`/privacy` covers the scanner in §6 ("The Free Site Scanner"): what it fetches and why, email handling and unsubscribe, 90-day retention of URL+findings, third parties the scan reveals the URL to, the ownership attestation, and the rate limits. Updated 2026-08-01 alongside Phase 2.

---

## 8. Implementation plan

### Phase 0 — Infrastructure
- [x] Add `@astrojs/vercel`; keep static output, opt API routes into on-demand rendering
- [ ] Confirm the account's actual max function duration (§2.3) — not yet needed, but gates phase 2
- [ ] ~~Neon: `scan_job` and `scan_finding` tables~~ — deferred to phase 2; check 1 is synchronous
- [x] Build the hardened fetch layer from §6 **first**, and unit-test it against the SSRF cases before any check uses it
- [x] `POST /api/scan` (synchronous; no `:jobId` route until phase 2)

### Phase 1 — Ship check 1 alone
- [x] robots.txt parser with correct group/precedence semantics
- [x] Agent table (§3.1) with per-agent consequence copy
- [x] Edge-block detection with control comparison
- [ ] **Decision on UA emulation (§9) before this ships**
- [x] Results UI at `/scan`, tagged gap/opportunity/good (renders all findings; streaming lands with phase 2)

A scan that *only* reports crawler blocking is already worth putting on the site. It is the best finding, it fits in ~10 seconds, and shipping it alone proves the funnel before we pay for headless rendering. **Do not wait for all five checks to launch.**

### Phase 2 — Cheap checks — **shipped 2026-07-31**
- [x] Sitemap discovery + sampling (homepage-first, 24 pages; stratification deferred)
- [x] Raw page fetcher with concurrency control
- [x] §3.2 structured data, with the boilerplate/entity tiering
- [x] §3.5 metadata, including near-duplicate clustering
- [x] §3.4 llms.txt, with soft-404 guarding
- [x] §3.7 feed/API surface discovery
- [x] §3.8 image AI-accessibility (folded into the metadata pass)
- [x] §3.9 organisation identity consistency
- [x] §3.10 platform fingerprint (drives remediation copy; never reported)
- [ ] §3.11 AI licensing signals — deferred (see §3.11)

### Phase 3 — Headless
- [x] Render provider chosen: **self-hosted, no paid service.** `puppeteer-core` + `@sparticuz/chromium`, lazily imported so the ~75MB never loads on a scan that skips the check. Local machines reuse an installed Chrome (`CHROME_PATH` overrides); Vercel gets the Amazon Linux binary.
- [x] §3.3 JS-content comparison
- [x] Budget instrumentation and the degradation ladder from §5

**§2.5 is superseded.** That section recommended a paid render API for predictable latency, written before there was any timing data. Measured: **~1.7s per page**, and the function bundle lands at **107MB against a 500MB limit**. Both fit comfortably, so the recommendation is reversed — self-hosted first, revisit only if cold starts prove worse in production than locally.

**Two things the spike changed.**

1. **Text extraction had to be real.** Stripping `<script>` and `<style>` then removing tags — the obvious approach — measured linear.app's homepage at **834KB of "text"**. It ships 179 inline SVGs and a 261KB stylesheet, and the leftover markup swamped the actual copy, making the ratio meaningless. `extractText` now also drops SVG, comments, `noscript`, `template` and `iframe`. This is the concrete form of the spec's own warning against raw `innerText`.
2. **Three pages, not five to eight.** At 1.7s each, the §3.3 sample had to shrink to keep the check inside the budget. It also runs *last* and only when at least 12s of budget remains, reporting itself as skipped otherwise — the §5 ladder, made explicit.

**Validation split.** The live sweep (linear.app, astro.build, wpbeginner.com) confirmed no false positives — all three correctly returned `good`, since Linear's marketing pages are prerendered rather than a true SPA. Proving the check *fires* needed fixtures rather than hunting for a live SPA, so `checkJsContent.test.ts` covers empty `#root`/`#__next`/`#___gatsby` shells and the content-rich negatives.

### Phase 4 — Delivery
- [ ] Email provider + report template
- [x] Ownership attestation (shipped in Phase 1)
- [ ] Shared-state rate limiting (in-memory limiter is a speed bump, not the §6 requirement)
- [x] Privacy-policy update — `/privacy` §6 covers the scanner: what it fetches, email handling, retention, third parties, attestation, rate limits
- [x] Point the homepage CTAs at the scanner instead of `/contact` (all three now go to `/scan`)

### Phase 5 — Validate the claim
- [x] First sweep: 15 sites across WordPress, Shopify-adjacent, Astro, Next.js, Gatsby, Ghost and hand-rolled. Harness in `validation.manual.ts`, run with `vitest.manual.config.ts` — deliberately outside the normal suite, because it hits live third-party sites.
- [x] Measured p50 **2.9s**, p95 **30.8s**, max **30.8s** (14 completed, 1 hard failure)
- [x] Copy changed to match, per the rule below: "Results in seconds" → "Usually a few seconds", and `/scan` states the worst case outright
- [ ] Second sweep against 20 *client-style* sites once the domain transfer lands — the current list is tech-industry sites, which are better maintained than the average agency-managed site and therefore an optimistic sample
- [ ] **If p95 drifts past a minute, change the copy or cut a check — do not ship a number the product misses**

**What the first sweep found.** Two real defects, neither visible from reading the code:

1. **`woocommerce.com` was refused outright** — "that domain resolves to a private address". The SSRF guard blocked all of `192.0.0.0/16`, but only `192.0.0.0/24` and `192.0.2.0/24` are reserved. `192.0.66.0/24` is Automattic, so **woocommerce.com, WordPress.com-hosted sites and anything behind Jetpack** were being turned away. On a product aimed at WordPress agencies that is close to the worst possible false positive. Fixed, with the specific address in the test suite.
2. **`metadata-near-duplicates` was over-firing.** It flagged Kinsta's "Kinsta Kingpin: Interview With &lt;name&gt;" series and Stripe's "Stripe Services Agreement - &lt;document&gt;" pages as interchangeable. They are not: the varying token *is* the subject. Severity now depends on whether the descriptions differentiate the pages — distinct descriptions downgrade it to an `opportunity` about truncation, identical or absent ones keep it a `gap`. Verified both sites land on the right side.

**Sample bias worth naming.** Every site in the first sweep is a tech company's own marketing site. They have SEO staff. A real agency-managed client site will be worse, which means these numbers are the *optimistic* end for finding counts and probably the pessimistic end for nothing at all. The second sweep matters more than the first.

---

## 9. Open decisions

1. **UA emulation (§3.1).** The compound-UA compromise needs a human sign-off. This is the only item here with a legal dimension, and it gates Phase 1.
2. **Render provider (§2.5).** Cost per scan is unknown until volume is. Pick after Phase 1 tells us the conversion rate.
3. **Email provider.** Resend is the default suggestion; nothing is chosen. The contact form uses Web3Forms, which is not suitable for transactional report delivery.
4. **Is the scan gated on email?** Current spec: yes, because the report is emailed. Alternative — show findings on screen free, email only for the full report. Worth A/B testing later; not worth blocking Phase 1.
5. **The 90-second number itself.** Once Phase 5 has real timings, either the product hits the number or the copy changes. Flagging it here so it does not quietly become 3 minutes with the homepage still claiming 90 seconds.

---

## 10. Copy alignment

If the checks change, these strings change with them. All currently live on `kat-design-updates`:

| Location | String |
| --- | --- |
| `SpaceSceneHero.astro` | "No call required. Results in seconds." — **revisit when phases 2–3 land** |
| `SpaceSceneHero.astro` | CTA "Scan a Client Site Free" → `/scan` |
| `index.astro` §Start here | The three steps — 01 give us a URL, 02 we scan and report, 03 you decide |
| `index.astro` §Start here | "Specific findings, not a grade." — constrains §4 |
| `index.astro` closing CTA | "The scan is free, it takes seconds, and the report is useful whether or not you ever hire us." — **same** |
| `ContactForm.astro` | "Free AI Readiness Scan (agencies)" dropdown option — now redundant with `/scan`; keep as a fallback path or remove |
| `scan.astro` | "No call required. Checks run in a few seconds." |
