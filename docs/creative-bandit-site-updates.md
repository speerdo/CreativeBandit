# Creative Bandit Site Updates — Spec for Claude Code

Context: creative-bandit.vercel.app currently reads as a solo dev portfolio (Adam Speer, AI automation/full-stack). It needs to become a two-person studio site: Adam (dev/AI automation) + Katlyn (design/motion). This doc also adds a placeholder for a new "Agent Ops" service line to be built out later.

Fill in the `[TODO: ...]` placeholders with real content/assets before or during implementation.

---

## 1. About Page — Restructure to Team of Two

**Goal:** Replace the solo founder bio with a two-person studio narrative.

- [ ] Add a "Meet the Team" or "Who We Are" section with two profiles side by side:
  - **Adam Speer** — Full-stack development, AI automation, agentic tooling. [TODO: 2-3 sentence bio, headshot]
  - **Katlyn [TODO: last name]** — Design, motion design. [TODO: 2-3 sentence bio, headshot, title — e.g. "Design & Motion Lead"]
- [ ] Update site copy from first-person singular ("I build...") to studio voice ("We build...") where appropriate, or keep individual voice per section if that reads better
- [ ] Update hero/tagline to reflect combined offering, e.g. "Full-stack development + design that moves." [TODO: finalize tagline]

## 2. Services Page — Add Design/Motion as a Real Offering

Currently "UI/UX Design" is a single generic line item under Adam's services. Expand into its own service pillar owned by Katlyn.

- [ ] New service block: **Design & Motion**
  - Brand/UI design
  - Motion design (explainer animations, product motion, social/marketing motion)
  - [TODO: any other specific services Katlyn offers — illustration, design systems, video editing, etc.]
- [ ] Keep existing pillars: Web Development, AI Automation, E-commerce
- [ ] Add new pillar (placeholder for now, build out later): **Agent Ops / WordPress Security & Maintenance**
  - One-line description: "Automated security, maintenance, and compliance monitoring for WordPress agencies and their clients."
  - [TODO: full section content — see Section 4 below]

## 3. Portfolio/Work — Add Specific Projects

Add real project entries. Replace [TODO] with actual project names, descriptions, links, and images/GIFs.

### Adam's dev projects (expand existing "Work" section)
- [ ] yieldtofreedom.com — income-investing platform, Astro 5 / Neon / Vercel / Drizzle. [TODO: description, screenshot]
- [ ] ebikelocal.com — niche eBike shop directory, Astro SSG / Neon / Vercel, Playwright scrapers. [TODO: description, screenshot]
- [ ] RecycleOldTech.com — electronics recycling directory, 20k+ monthly visitors. [TODO: description, screenshot]
- [ ] [TODO: any client work that's shareable — IndiAide, Ever.Ag, etc., if permitted]

### Katlyn's design/motion projects (new section)
- [ ] [TODO: Project 1 — name, description, before/after or video/GIF]
- [ ] [TODO: Project 2]
- [ ] [TODO: Project 3]
- [ ] Consider a filterable Work grid (Dev / Design / Motion / All) if project count grows

## 4. New Service: Agent Ops (WordPress Security & Maintenance)

Add as its own page or prominent section (not homepage-dominant — this is a new/unproven offering, shouldn't overshadow core agency positioning yet).

- [ ] Route: `/services/agent-ops` or `/wordpress-security` [TODO: finalize URL]
- [ ] Headline: [TODO — e.g. "Automated Security & Maintenance Ops for WordPress Agencies"]
- [ ] Sub-headline: explain the problem (agencies manage security/updates/uptime manually across many client sites, error-prone and time-consuming)
- [ ] What's included (draft, refine later):
  - Security header audits + automated fixes
  - Plugin/core update monitoring
  - Uptime + broken link / mixed content scanning
  - Weekly/monthly client-ready reports
- [ ] Pricing: [TODO — likely tiered by site count, e.g. per-site/month or agency bundle]
- [ ] CTA: "Book a free audit" or similar — routes to contact form or Calendly
- [ ] Keep this section flagged as new/pilot — consider a "currently onboarding pilot agencies" note for early credibility framing

## 5. Smaller Fixes

- [ ] Fix broken LinkedIn footer link (currently points to `#`)
- [ ] Either populate the "transparent pricing" section with real numbers/ranges, or remove the claim until pricing is finalized
- [ ] Add a testimonials/social proof section (even 1-2 quotes from past clients is better than none) — [TODO: gather quotes]
- [ ] Confirm newsletter/checklist opt-in forms have actual content behind them, or remove until ready

## 6. Not in Scope for This Pass

- Full agent-ops build-out (backend, plugin, agent logic) — separate project, comes after this site update
- Spinning agent-ops off to its own domain — revisit once pilots are running
