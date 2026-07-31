# Creative Bandit — AI Readiness Scan

**Status:** Phases 0 and 1 built on `ai-readiness-scan`. Phases 2–5 outstanding.
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

---

## 0. Why this exists, and the deadline attached to it

The homepage rewrite put this on the page, twice:

> **Scan a Client Site Free** — No call required. Results in about 90 seconds.
> *The scan is free, it takes about 90 seconds, and the report is useful whether or not you ever hire us.*

Both CTAs currently point at `/contact`, where a human answers. That is a promise the site cannot keep, and it is the kind of claim a visitor times with the clock on their phone. This spec closes that gap.

Two consequences worth stating up front, because they constrain every decision below:

1. **90 seconds is a product requirement, not an aspiration.** It is printed on the page. A check that cannot fit inside the budget gets cut or moved to the emailed report, not allowed to stretch the number.
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

Ordered by value to the reader, which is also the order they should resolve on screen.

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

**Findings produced:**

- `gap` — "GPTBot, ClaudeBot and PerplexityBot are blocked in robots.txt" (name the agents, quote the rule, give the line number)
- `gap` — "AI crawlers are blocked at the CDN. Your robots.txt looks clean, which is why this is easy to miss." ← *the most valuable single sentence in the product*
- `good` — "All major AI crawlers can reach this site."

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

---

## 4. Finding schema

One shape for every check, so the UI and the email template never special-case.

```ts
interface Finding {
  id: string;                    // stable slug, e.g. 'robots-ai-blocked'
  check: 'crawlers' | 'schema' | 'js-content' | 'llms-txt' | 'metadata';
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

## 5. The 90-second budget

Indicative allocation. Measure and revise once real sites are running through it.

| Phase | Budget | Notes |
| --- | --- | --- |
| Resolve, validate, SSRF checks | 2s | §6 |
| robots.txt + edge probes (§3.1) | 8s | Parallel across agents. First findings on screen here. |
| Sitemap discovery + sampling | 8s | |
| Fetch sample pages (raw) | 20s | Concurrency 5, per-domain politeness |
| Schema + metadata parse (§3.2, §3.5) | 5s | CPU-bound, cheap, runs on already-fetched HTML |
| llms.txt (§3.4) | 2s | Trivial, can run anytime |
| Headless renders (§3.3) | 35s | 5–8 pages, the long pole |
| Assemble, persist, queue email | 5s | |
| **Total** | **~85s** | |

**Degradation, in order, on overrun:** cut headless renders to 3 pages → drop §3.3 entirely → shrink the page sample to 15. Never drop §3.1; it is the product.

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

`/privacy` will need a paragraph covering the scanner before launch — it currently says nothing about processing third-party sites or storing scan results.

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

### Phase 2 — Cheap checks
- [ ] Sitemap discovery + stratified sampling
- [ ] Raw page fetcher with concurrency control
- [ ] §3.2 structured data, with the boilerplate/entity tiering
- [ ] §3.5 metadata, including near-duplicate clustering
- [ ] §3.4 llms.txt, with soft-404 guarding

### Phase 3 — Headless
- [ ] Choose the render provider (§2.5)
- [ ] §3.3 JS-content comparison
- [ ] Budget instrumentation and the degradation ladder from §5

### Phase 4 — Delivery
- [ ] Email provider + report template
- [ ] Ownership attestation, rate limiting, privacy-policy update
- [x] Point the homepage CTAs at the scanner instead of `/contact` (all three now go to `/scan`)

### Phase 5 — Validate the claim
- [ ] Run 20 real agency-managed WordPress sites through it
- [ ] Measure p50/p95 wall-clock against the 90-second promise
- [ ] **If p95 exceeds 90s, change the copy or cut a check — do not ship a number the product misses**

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
| `SpaceSceneHero.astro` | "No call required. Results in about 90 seconds." |
| `SpaceSceneHero.astro` | CTA "Scan a Client Site Free" → currently `/contact` |
| `index.astro` §Start here | The three steps — 01 give us a URL, 02 we scan and report, 03 you decide |
| `index.astro` §Start here | "Specific findings, not a grade." — constrains §4 |
| `index.astro` closing CTA | "The scan is free, it takes about 90 seconds, and the report is useful whether or not you ever hire us." |
| `ContactForm.astro` | "Free AI Readiness Scan (agencies)" dropdown option — remove once the real scanner ships |
