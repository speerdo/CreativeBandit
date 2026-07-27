# Creative Bandit — Visual Identity Redesign

**Branch:** `kat-design-updates`
**Status:** Phases 0–7 landed. Remaining work in §9.
**Date:** 2026-07-26

Aesthetic overhaul of creativebandit.studio. Site structure, routes, copy, and SEO stay as-is. What changes is the entire visual language: from generic dark-SaaS-with-neon-gradients to **digital space cowboy** — grainy photography, risograph print artifacts, gritty blurred gradients, and a bandit-cat mascot.

Reference assets live in `docs/refs/`:

| File | What we're taking from it |
| --- | --- |
| `blurred gradient.avif` | The core background move — huge soft-focus color fields, saturated, **grain over the gradient** |
| `photo-grain.avif` | Halftone/photocopy photography, hard-cut grid collage, single acid accent line-work |
| `risograph-1.jpg`, `risograph-2.avif` | Halftone dot cutouts, hand/eye/face fragments, spiky vector bursts over duotone photo |
| `scanner-cutoff.avif` | Chromatic aberration, scan smear, technical crop marks, tight Helvetica-ish display type |
| `weird-western-1.avif`, `weird-west-2.avif` | The cowboy half — bandana masks, distressed print texture, saloon-poster type energy |
| `web design.avif` | Editorial layout discipline: black/bone slabs, one hot accent blob, restrained grid |

The synthesis: **risograph print shop meets scanned-in sci-fi paperback.** Cowboy iconography rendered as if run through a Riso duplicator and then a broken flatbed scanner. Grainy, off-register, high-contrast — but laid out with editorial restraint so it reads professional, not "grunge tumblr."

---

## 1. Why the site currently looks AI-generated

Worth naming precisely, because these are the things to remove. The current design isn't bad — it's *generic*. Every one of these is a 2024-era LLM-scaffold tell:

1. **Glassmorphic hero card** — `rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl` in `BirdSwarmHero.astro:14`. This exact class string is the single loudest signal.
2. **Gradient text on every headline** — `.gradient-text` (red→purple `bg-clip-text`) appears **46 times across 11 files**. One word of every `h2` is gradient-filled, without exception.
3. **The `flame-dot` + uppercase eyebrow** — 32 uses across 12 files. Pulsing dot, `uppercase tracking-wider text-light-300` label, then `h2`, then a gray paragraph. Identical rhythm on every single section.
4. **Neon blur blobs** — `w-96 h-96 bg-<color>/5 blur-3xl rounded-full` scattered as "ambient depth." ~10 instances. Reads as glow, not as ink.
5. **Uniform card grid** — every card is `rounded-lg p-6 border` with a hover border-color change. No variation in shape, weight, or texture.
6. **Outfit + Inter** — the default "modern startup" pairing.
7. **Pexels stock photos** — four hotlinked generic stock images in `index.astro:42-67`.
8. **Centered `max-w-3xl mx-auto` section intros** — same alignment, same width, every section, top to bottom.

The fix is not to add texture on top of this. It's to replace items 1–6 and let texture do the work items 1–4 were faking.

---

## 2. Palette — risograph ink set

Retiring the flame palette. New tokens, modeled on actual Riso ink drums:

```
BASE     #0B0B0C   near-black          page ground
PAPER    #EDE8DF   bone / riso paper   inverted sections, body type on dark
INK-HOT  #FF4D14   fluoro orange       primary accent, CTAs
INK-COLD #1B27E8   riso blue           plates, fills, large graphic areas
INK-ACID #D9F24A   yellow-green        line-work, technical labels, hover
INK-PINK #E5195A   riso pink           secondary accent, duotone partner
```

Duotone pairings (never more than two inks in one composition):
- `INK-HOT` + `INK-COLD` — hero, primary sections
- `INK-PINK` + `INK-ACID` — work/portfolio, secondary sections
- `PAPER` on `BASE` — all body copy

### Contrast constraints — read this before using the blue

Measured against `BASE` (#0B0B0C):

| Ink | Ratio | Verdict |
| --- | --- | --- |
| `PAPER` #EDE8DF | **16.0:1** | ✅ any text size |
| `INK-ACID` #D9F24A | **15.6:1** | ✅ any text size |
| `INK-HOT` #FF4D14 | **5.9:1** | ✅ passes AA normal text |
| `INK-PINK` #E5195A | **4.3:1** | ⚠️ large text only (≥24px, or ≥19px bold) |
| `INK-COLD` #1B27E8 | **2.3:1** | ❌ **never for text.** Fills and plates only. |

Riso blue is the trap here — it's gorgeous as a flat plate and unreadable as type. For blue *text* on dark, add a lightened tint:

```
INK-COLD-LIFT  #6E79FF   5.4:1 ✅   text-on-dark variant of INK-COLD
```

### Token migration

Current usage counts: `blazingEmber` 129 hits / 19 files, `light-300` 168 / 20, `gradient-text` 46 / 11, `flame-dot` 32 / 12, `coreFire` 17, `magentaFlame` 20, `flameTip` 18.

Rename rather than retune — `blazingEmber` describing `#FF4D14` would be a lie future-us trips over. **Do the rename as its own mechanical commit** (`sed` across `src/`, no visual intent) so the subsequent styling commits stay reviewable:

| Old | New |
| --- | --- |
| `charcoal` | `base` |
| `blazingEmber` | `ink-hot` |
| `coreFire` | `ink-hot` (collapse — near-duplicates today) |
| `flameTip` | `ink-acid` |
| `magentaFlame` | `ink-cold` |
| `light-100/200/300` | `paper` / `paper-dim` / `paper-mute` |
| `dark-100/200/300` | `base-100/200/300` |

`.gradient-text` and `.flame-dot` get deleted, not renamed — see §4.

---

## 3. Typography

Drop Outfit. Three roles:

| Role | Face | Why |
| --- | --- | --- |
| Display | **Archivo** (variable: width + weight axes) | One family gives both wide-caps poster headlines and tight condensed labels. Google-hosted, no license cost. Grotesque bones match `scanner-cutoff`. |
| Body | **Inter** (already loaded) | Neutral, invisible, stays out of the way. Keep. |
| Technical | **Space Mono** | The `scanner-cutoff` micro-labels — crop marks, coordinates, file specs, `//` annotations. Carries most of the "digital artifact" flavor for almost no effort. |

Treatments:
- Headlines: `Archivo` expanded, tight tracking (`-0.02em`), **all-caps for h1/h2**. Poster energy.
- Ditch centered section intros. Left-align, and let a few headlines break the grid or bleed off-canvas.
- Mono micro-labels replace the `flame-dot` eyebrow: `// 01 — SERVICES` instead of `● OUR SERVICES`.
- Occasional condensed-caps stack for stat blocks, saloon-poster style.

---

## 4. The texture system

This is the actual substance of the redesign. Six layers, built as reusable utilities in `global.css` — **not** hand-rolled per component.

### 4.1 Global grain — `.grain-overlay`

The load-bearing layer. Everything else looks cheap without it.

- Baked tiling PNG (data-URI, ~2–4KB) from an `feTurbulence fractalNoise` render. **Bake it; don't run a live SVG filter full-viewport** — that's a real per-frame cost for a static result.
- One `position: fixed` full-viewport pseudo-element, `mix-blend-mode: overlay`, `opacity: 0.10–0.14`, `pointer-events: none`, `z-index` above content.
- Single global instance. Never per-card.

### 4.2 Blurred gradient fields — `.field-*`

Replaces the neon blur blobs. Key insight from `blurred gradient.avif`: those gradients look expensive **because of the grain sitting on them**. A smooth CSS gradient alone reads cheap and web-2.0.

- Large `radial-gradient` lobes at full ink saturation, `filter: blur(60–100px)`.
- Asymmetric and off-canvas — bleeding past the viewport edge, not politely centered.
- Grain composited over the top, always.
- 2–3 per page maximum. These are hero moments, not ambient filler.

### 4.3 Halftone — `.halftone`, `.halftone-fine`

- CSS dot grid: `radial-gradient` + `background-size: 3px 3px`, applied via `mask-image` so it bites into artwork rather than sitting on top.
- Photo treatment uses an SVG filter chain (`feColorMatrix` → `feComponentTransfer`) for a true 2-plate separation.

### 4.4 Duotone images — `.duotone-hot`, `.duotone-cold`

- `filter: grayscale(1) contrast(1.35)` then a colored layer in `mix-blend-mode: color` / `screen`.
- Applies to team headshots, project screenshots, and any future photography. Also **solves the stock-photo problem** — heavy duotone + halftone makes generic photography read as deliberate collage material.

### 4.5 Misregistration — `.plate-shift`

The most authentic Riso artifact: plates that don't line up.

- Duplicate the element via pseudo-elements, offset each 2–3px, one ink per plate, `mix-blend-mode: multiply`.
- Applies to display headlines, the mascot, and section rules.
- **This is what replaces `.gradient-type`.** Instead of a smooth red→purple fill, a headline is bone type with an orange plate 2px left and a blue plate 3px down. Same "the headline is special" job, completely different read.

### 4.6 Scan artifacts — `.aberration`, `.scanline`, `.torn`

Used sparingly — these are seasoning, and it's easy to overdo them.

- `.aberration` — cyan/red `text-shadow` offsets. Hover states and scroll-triggered moments only.
- `.scanline` — faint horizontal `repeating-linear-gradient`, very low opacity, on dark slabs.
- `.torn` — irregular `clip-path` for section edges, so slabs end on a ripped-paper line instead of a straight border.

---

## 5. Mascot — the bandit cat

Hand-built SVG in `public/mascot/`, riso treatment applied via filters. Version-controlled, recolorable, animatable, a couple KB.

```
public/mascot/bandit-cat.svg
  <g id="plate-hot">    cowboy hat brim + crown       → INK-HOT
  <g id="plate-cold">   bandana over muzzle           → INK-COLD
  <g id="plate-paper">  head, ears, muzzle fur        → PAPER
  <g id="plate-line">   eyes, whiskers, hat stitching → BASE
  + feTurbulence grain inside the SVG
  + 2-3px offset between plates = misregistration
```

Design direction: geometric, confident linework — closer to a stamped print or a mission patch than a cartoon. Cowboy hat, bandana pulled up over the muzzle, eyes visible above it. Futuristic elements come from framing rather than gadgetry: circular badge enclosure, mono coordinate labels, crop marks, faint scanlines across the face. Think *pilot patch for a ship that smuggles*.

Deliverables:
- `bandit-cat.svg` — full mascot, primary
- `bandit-cat-head.svg` — tight crop for favicon and avatar use
- `favicon.svg` — replace the current one
- `og-image` — mascot on a grainy gradient field, replaces `ogImage = "/favicon.svg"` in `Layout.astro:18`

Animation (all behind `prefers-reduced-motion`):
- Idle: slow ear twitch, occasional blink
- Hover: plates jolt apart then resettle — a print misfeed
- Scroll: plate offset widens slightly with scroll velocity

---

## 6. Component-by-component

| File | Change |
| --- | --- |
| `tailwind.config.js` | New ink tokens; delete flame colors; Archivo + Space Mono; new keyframes (`plate-jitter`, `grain-drift`); remove `flicker`/`float` |
| `styles/global.css` | Core rewrite. All texture utilities land here. Delete `.gradient-text`, `.flame-dot`, `.flame-gradient`, `.about-card-glow` |
| `layouts/Layout.astro` | Swap font links; add global `.grain-overlay`; new `theme-color`; mascot favicon + OG image |
| `components/SpaceSceneHero.astro` | **Kill the glass card.** Type sits directly on the gradient field with plate-shift. Mono micro-labels for stats. (Was `BirdSwarmHero.astro`; renamed in Phase 7.) |
| `lib/rocketScene.ts` | Replaced `birdSwarm.ts` in Phase 7. Flat 2D ink plates in the screen plane rather than a 3D flock |
| `components/Navbar.astro` | Wordmark → mascot head + Archivo caps. Nav links get `.aberration` on hover |
| `components/ServiceCard.astro` | Riso-plate cards: hard edges or `.torn`, ink-block icon wells, halftone corner. Break the uniform grid — vary sizes |
| `components/ProjectCard.astro` | Duotone + halftone on imagery. Mono spec labels for category |
| `components/TeamMember.astro` | Duotone headshots, halftone cutout edges à la `risograph-1` |
| `components/TestimonialCard.astro` | Bone paper slab on dark — inverted, quote-poster feel |
| `components/AnimatedStats.tsx` | Condensed-caps numerals, plate-shift, drop the pulse glow |
| `components/ExitPopup.tsx` | Mascot appears here. Torn-paper edges, riso print aesthetic |
| `components/Footer.astro` | Bone slab, mono legal type, crop marks. Also **fix the `#` LinkedIn link** (open from the earlier spec doc) |
| `components/ContactForm.astro` | Hard-edged inputs, ink underlines instead of rounded boxes, acid focus ring |
| `pages/*.astro` (10 files) | Remove per-page neon blobs; re-lay-out section intros left-aligned with mono labels; vary section rhythm |
| `components/Hero.astro` | **Delete** — dead file, superseded by `BirdSwarmHero.astro`, nothing imports it |
| `components/Welcome.astro` | **Delete** — dead Astro-starter leftover, nothing imports it |

---

## 7. Phasing

Sized so each phase is independently reviewable and the site stays deployable throughout.

**Phase 0 — Mechanical rename** ✅ `3cad1f6`
Token rename via `sed`, zero visual change. Lands alone so later diffs are readable. Verified inert by diffing the set of colour values in the built CSS before and after — identical. Also removed two dead components (`Hero.astro`, `Welcome.astro`).

**Phase 1 — Foundation** ✅ `609995a`
Tailwind tokens, fonts, `global.css` texture utilities, global grain overlay.

Deviation from the plan, deliberately: rather than deleting `.gradient-text` (46 uses) and `.flame-dot` (32 uses) and leaving every page broken until Phase 4/5, both were **redefined in place** to the new treatments. The whole site restyled in one commit with zero call-site churn, and stayed deployable. Migrating those call sites onto `.plate-type` / `.label-tech` moves to Phase 5.

Two measured corrections to the plan's assumptions:
- The grain tile is **13KB, not the 2–4KB estimated** in §4.1. Random noise is close to incompressible; a smaller tile would start to show a repeat. 13KB for one cached request is fine, but the estimate was wrong.
- `grain-drift` is defined but **not applied**. Animating a full-viewport blended layer means repainting the blend every step — exactly the cost §8 says to avoid. Kept available for small opt-in surfaces.

**Phase 2 — Mascot** ✅ `d6c5634`
Built `bandit-cat.svg`, `bandit-cat-head.svg`, `favicon.svg`, OG image; mascot wired into the navbar.

Learned by rasterising each build at its real size rather than trusting the markup: plate order has to be **by depth, not by ink** (grouping strictly by ink buried the bandana behind the head), a silhouette crease in the hat crown reads as a second pair of ears, and near-black whiskers are invisible where they cross the dark ground.

Two open items:
- The OG image is type + gradient field only. The mascot inset would not composite — the local SVG rasteriser silently drops the inlined mascot group despite the file parsing clean. Needs a headless-browser export.
- Per §5 the mascot was to carry `feTurbulence` grain internally. Left out: the page-level grain already covers it on-site, and an SVG filter is a liability at favicon sizes.

**Phase 3 — Hero + navigation** ✅ `b6fa969`
Glass card removed, type sits directly on two ink fields, mascot composited into the right column, stats left-aligned with ink rules and mono labels.

Uncovered an inverted Tailwind layer order: `global.css` opened with `@import 'tailwindcss/...'`, which emitted this file's `@layer components` block **after** the utilities. Component classes therefore beat any utility override on the same element — `class="card p-8"` silently ignored the `p-8`, and the `z-index` in `.field` beat `-z-30`, which would have floated the blurred gradients on top of the birds. Measured in the built CSS: components at 33–36k, utilities at 12–17k. The `@tailwind` directive form restores the intended order.

**Phase 4 — Components** ✅ `e732e18`
Cards, team, testimonials, form, footer, stats, exit popup.

Three bugs found:
- `text-base` is ambiguous — `base` is both our near-black colour token and Tailwind's default font-size key, so `@apply` emitted **both**, silently overriding `.btn-primary`'s `text-sm`. Near-black type now sets its colour directly. **Worth remembering when adding any new component.**
- A heading was using raw `ink-cold` (2.34:1) — the one colour §2 forbids for text. Arrived via the Phase 0 rename, since the old `magentaFlame` was light enough to get away with it.
- The footer LinkedIn link and both TeamMember social links pointed at `#`. They now render only when given a real URL.

**Phase 5 — Page layouts** ✅ `ef63ff3`
29 eyebrows → `.label-tech`; 37 `.gradient-text` → `.plate-type`; 14 centred intros left-aligned; 18 blur blobs deleted; 22 round dots and 21 rounded corners squared off. Legacy aliases deleted; `.flame-gradient` renamed `.page-wash`.

Also found: the work/blog filter buttons toggled active state by stacking `text-ink-hot` on top of `text-paper-mute` — two utilities for one property, resolved by stylesheet order rather than DOM order, which only worked because the idle state previously had no text colour. Replaced with a `.chip` component and an `is-active` class. `services.astro` carried a 39-line copy-pasted filter script with no matching elements; `index.astro` referenced an `.about-card-glow` class that was never defined.

**Phase 6 — Polish** ✅
- **The flock is now a dynamic import.** It pulls in Three.js at ~490KB — a lot of JavaScript for a decorative background. It now loads only on a real viewport, only without `prefers-reduced-motion`, and only once the hero is on screen. **Homepage eager JS: 491.4KB → 1.5KB.** The hero reads fine without it, since fields, type, and mascot are all CSS and markup.
- Reduced motion: verified the CSS block reaches all 14 pages. `AnimatedStats` was counting numbers up from zero regardless of the setting — fixed to jump straight to the final value. `birdSwarm.ts` already self-throttled; it is now skipped entirely instead.
- Contrast: 16 pairs audited across text, buttons, chips (including the tinted active background) and the bone slabs. All pass; worst case 5.10:1.
- `grain-drift` deleted rather than left as unused config. `plate-jitter` is wired to the navbar mascot hover.

**Phase 7 — Hero scene: rocket, cat, UFOs** ✅
The bird flock is replaced by a rocket with the bandit cat in the cockpit and four UFOs strung out behind it. `birdSwarm.ts` deleted; `BirdSwarmHero.astro` renamed `SpaceSceneHero.astro`.

Built **flat in the XY plane**, not in full 3D. The flock used a proper 3D orientation basis, but a rocket that rolls in 3D turns its cockpit window away from the camera and loses the cat. Restricting the craft to a single Z rotation keeps it broadside at all times, and flat vector plates sit closer to the riso look than shaded solids anyway.

The UFOs sample a **time-stamped trail** of the rocket's own past positions rather than each chasing the one ahead. A pursuit chain can oscillate and bunch up under hard turns; sampling a shared trail keeps the convoy evenly spaced whatever the rocket does.

Two things worth recording:
- Materials are deliberately **not** flagged `transparent`. Every plate is opaque, and marking them transparent would move them into the depth-sorted transparent pass where near-coplanar parts can flicker in and out of order.
- The static mascot is now a **fallback**, hidden at `lg` by default and un-hidden when the scene skips (reduced motion) or fails, with a `<noscript>` rule for JS being off. Showing it by default would have flashed a mascot on desktop and popped it out once the chunk arrived.

Flight tuning is governed by two ratios, both non-obvious enough to be worth writing down:

- **Loop size is `speed² / force`, not speed.** At 3.2 and 2.6 the turn radius is ~4.9 units. Raising the steering force tightens it straight back into short darts. Removing the arrive-style damping matters just as much — easing down on approach is what made the first version read as stop-start.
- **A 4.9-unit turn radius does not fit a 2.7-unit-tall box.** Simulating the path showed it reaching |y| 4.43 against a frustum half-height of 3.84 — the rocket was flying off the top and bottom of the screen. Fixed by dropping the vertical play area to 2.0, raising containment force, and shrinking the wander's vertical amplitude so the loops run sideways, where a hero canvas has room. Worst case with the cursor pinned off-area is now |y| 2.70.
- **The UFO lag swing has to stay under half the base spacing.** The first pass used 0.34 spacing with a 0.3 swing, which let neighbours reach the same lag and swap order — three of the four ended up stacked on each other. Now 0.34 / 0.22 with tighter phases: worst-case gap +0.26s, about 0.84 world units against a saucer 0.52 wide.

Checked the craft by mirroring the exact shape coordinates into an SVG and rasterising it — the first pass had ears that read as devil horns and a bandana that read as a pointed beard. Both reshaped.


Not done: a real Lighthouse run and the cross-browser blend-mode check, both of which need a browser.

---

## 7b. Mascot pose set

Three full-body builds, all wrapped around the **existing head artwork embedded verbatim** rather than redrawn — the head is the strongest piece of the identity and hand-coding a replacement would only make it worse.

| File | Pose |
| --- | --- |
| `mascot/bandit-cat-sleeping.svg` | Curled asleep, tail wrapped, acid `z`s |
| `mascot/bandit-cat-pistols.svg` | Sitting upright, arms akimbo, two alien sidearms |
| `mascot/bandit-cat-batting.svg` | Sitting, swiping at a mouse-sized UFO |

All three were subsequently reworked in Illustrator (orange boots, belts, better limbs), so the generator script has been **deleted** — it would have overwritten that work on any future run. These are now hand-maintained assets; edit the SVGs directly.

Illustrator strips `<title>` on export, so the accessible name has to be restored by hand after each round-trip. Worth checking whenever a pose is re-exported.

Three things learned building them:

- **Limbs are stroked paths with round caps, not filled outlines.** Keeping a constant thickness through a bend is far easier this way, and the first attempt with filled shapes read as blobs rather than legs.
- **Bone-on-bone needs tonal separation, not keylines.** Tails and far haunches drop to `paper-dim`. Outlining only the body would have looked grafted onto a head that has none.
- **Judge them on the real background.** The first previews rendered on white and looked fine; on near-black the faded `z`s went muddy and the paper-on-paper overlaps vanished.

The sleeping build drops the head's eye group and substitutes closed curves — the one place the embedded artwork is modified rather than reused as-is.

Placed on the homepage: pistols beside the *Real Results* header, batting beside *Featured Work*, both filling the empty right of a header row and hidden below `lg` where the column collapses.

The sleeping cat sits on the footer's top rule sitewide, **except** `/privacy` and `/terms` — those put a pale slab directly above the footer, where a bone-coloured cat all but vanishes. (Both pages were also using off-palette `bg-white`; now `bg-paper`.)

Every placement declares `width`/`height` matching its viewBox aspect. The three poses have quite different ratios — 1.87, 0.77, 1.11 — so a copy-pasted box would shift layout as the SVG loads.

---

## 7c. Mascot hover animations

Each placed mascot animates on hover: the pistols cat coils to jump (squat, hat settles, arms swing out, tail sways), the batting cat leans in and brings its paw down on the UFO, and the sleeping cat twitches an ear and a tail without waking.

**This is why the mascots are inlined rather than `<img>`.** CSS cannot reach inside an `<img>`-loaded SVG document, so `:hover` on the page can't drive a transform on a path in there. `Mascot.astro` reads the file at build time and inlines it.

Inlining and animating flat Illustrator output turned up four traps, all now handled in the component:

1. **Class and id collisions.** Every export names its classes `st0..stN` and its ids `clippath`, `bch-halftone`. Two mascots on one page restyle each other, so both are namespaced per pose.
2. **No layer names**, so parts are addressed by index in document order. Brittle by nature, so each entry records the paint it expects and the build **fails loudly** if the artwork shifts underneath it — verified by injecting a stray shape and watching it throw. Naming the layers in Illustrator would let us drop the index map entirely and target real ids.
3. **Baked `transform` attributes.** Illustrator writes placement into `transform` on some shapes — the batting UFO's dome and body, and the pistols hat band and buckle, all carry `translate+rotate`. A CSS transform *replaces* the attribute rather than composing with it, which threw the UFO across the canvas and knocked the hat band clean off the hat. **Every** animated part is therefore wrapped in a group that carries the animation while its children keep their own transforms; a CSS transform never lands on a raw shape. 26 elements in the built page carry baked transforms and none of them is tagged directly.
4. **Tailwind purging.** The wrapper class was built as `` `cb-mascot--${pose}` `` — an interpolated name is invisible to Tailwind's content scanner, so every per-pose rule was purged and the animations silently did nothing while the markup still looked correct. The pose classes are now spelled out as literals.

With `transform-box: fill-box`, a rotation on a multi-element part spins each element about its own centre, so anything rotating must be a single wrapped group. Non-contiguous parts (the pistols hat, seven pieces interleaved with the ears) get one wrapper *each* — the group still shields any baked transform, and a uniform translate across separate wrappers is equivalent to translating one.

Pivots matter as much as the transform: the sleeping tail leaves the body on the right and sweeps left, so hinging it at the left made the whole tail appear to slide rather than flick. Its origin is at the right-hand root.

All hover motion is disabled under `prefers-reduced-motion`; the keyframed parts only get an `animation` on hover, so nothing runs while the page sits idle.

---

## 8. Guardrails

**Performance**
- Bake the grain to a tiling PNG. One fixed overlay, not per-element.
- `mix-blend-mode` and `filter` force new compositing layers — keep blended elements few and large, never per-card.
- `will-change` only on elements that actually animate.
- Budget: keep Lighthouse performance ≥ 90 on mobile. Check after Phase 3, not at the end.

**Accessibility**
- Honor the §2 contrast table. `INK-COLD` never carries text.
- Grain overlay at `opacity ≤ 0.14` — beyond that it starts eating small-type legibility.
- `.aberration` is decorative only; never the sole indicator of state.
- Every animation gated behind `prefers-reduced-motion`, including mascot idle and plate-shift.
- Verify focus rings survive the restyle — acid ink on dark is the right call and passes easily.

**Browser support**
- `mix-blend-mode`, `backdrop-filter`, SVG filters: fine in evergreen browsers. Safari `mix-blend-mode: overlay` on `position: fixed` needs an explicit check.
- Degradation path: no blend-mode support → flat inks, no grain. Still looks intentional.

**Restraint**
The failure mode is applying all six texture layers everywhere and landing at illegible mush. Discipline: **two inks per composition, one hero texture moment per page, grain everywhere, everything else sparingly.** `web design.avif` is the reference for restraint — mostly empty black and bone, one hot accent doing all the work.

---

## 9. Open questions / follow-ups

**Needs a browser (blocked while working headless):**
- [ ] Lighthouse run on mobile; §8 sets the bar at ≥ 90.
- [ ] Safari check on `mix-blend-mode: overlay` over a `position: fixed` layer — the global grain depends on it.
- [ ] OG image: the mascot inset would not composite via the local SVG rasteriser despite the file parsing clean. The shipped image is type + gradient field only. Redo with a headless-browser export.

**Design decisions still open:**
- [ ] Mascot name. "Bandit" is the obvious read but may be too on-the-nose against "Creative Bandit".
- [ ] The hero scene only renders on desktop without reduced-motion, and is still ~500KB of Three.js for decoration. If it ever stops earning that, the same rocket could be done as an animated SVG for a fraction of the payload.
- [ ] Stock photography: duotone is carrying the Pexels placeholders convincingly, but real project screenshots would be better.
- [ ] Bone-paper *sections* (full inverted slabs) or bone only for cards? Testimonials are the only inversion so far.
- [ ] Should the mono labels carry real data (dates, project IDs) rather than section names?

**Tech debt noticed in passing (out of scope for this redesign):**
- [ ] `ExitPopup` and `AnimatedStats` are ~6KB of component code pulling a 182KB React runtime via `client:only`. Both are simple enough to be vanilla JS/Astro, which would drop React from the site entirely.
- [ ] `og-image.png` is 337KB. Fine for a crawler-only asset, but a JPEG would be a fraction of that.
- [ ] `blog/index.astro` still uses the deprecated `Astro.glob`, which warns on every build.

## 10. Not in scope

- Copy rewrites — content stays as-is except mono micro-labels
- Route/IA changes — structure is explicitly preserved
- The remaining `[TODO]` content gaps from `creative-bandit-site-updates.md` (real testimonials, Katlyn's project entries, pricing) — tracked separately, though testimonial cards and project cards get restyled here and will look better once populated
