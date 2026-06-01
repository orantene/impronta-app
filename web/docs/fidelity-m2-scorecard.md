# Builder Fidelity — M2 Scorecard

**Date:** 2026-06-01 · **Lane:** P4 Lane B (design rebuild + scoring) · **Base:** `feat/builder-p4-harness` (Lane A)

## What this is

M1 (~58 blended) was the harsh baseline scored on the *old* harness designs: the
hero/series imagery was `data:` SVG placeholders that the renderer's image guard
**drops entirely** (they rendered as nothing), headings/paragraphs fell back to
system Georgia/Arial (no registry face loaded), and glass/motion were
unscoreable from a single static frame. M2 re-scores against the **same
discipline** on three rebuilt designs that genuinely use the P1–P3 stack —
registry fonts via the font bridge, **real photography**, P3 repeaters driven by
inline `dataSources.collections`, rich_text, pricing_table, hover/transition,
container queries, and a scroll reveal.

**Scoring method (honest-scoring discipline):**
- Scored **only from captured frames** in `web/fidelity/<design>/` (the
  `capture.ts` output — served over http so real photos + bundled woff2 load and
  the font self-check + 0-byte determinism self-test both pass). No credit for
  "it should look right."
- **Glass and motion are scored from the motion frames, not the static frames**
  (per the rubric): `saas-1440-scrolled.png` (sticky + backdrop-filter glass over
  scrolled content), `saas-1440-hover.png` (CTA hover end-state), and
  `editorial-1440-reveal.png` (scroll-reveal settled).
- Overall per design = `(sum of 7 axes) * 20 / 7`. The blended M2 is the mean of
  the three archetype overalls. **Per-axis gains are NOT summed into the
  headline** — that would inflate real progress ~4×.
- **No axis is scored 5.0.** These are built *from archetype intent*, not pixel-
  matched to a named external comp, and every frame has at least minor
  compromises — so 4.5 is the ceiling I can defend from the evidence.
- `trivial` is the determinism/self-test baseline, not an archetype; it is
  excluded from the blended M2 (it now renders a real photo + Fraunces/Inter and
  passes the 0-byte self-test).

---

## editorial — Editorial photography portfolio

Target intent:
1. Luxury single-artist photographer's book — oversized Fraunces serif display,
   quiet uppercase Inter nav, warm cream/ink palette.
2. Asymmetric hero: copy + a full-bleed portrait with an overlapping detail crop.
3. A restrained "selected series" triptych + one dark scroll-reveal statement.

Screenshots: `fidelity/editorial/editorial-1440.png` · `-768.png` · `-390.png` ·
`-1440-reveal.png`

| Axis | Score | Evidence |
|---|---:|---|
| Layout accuracy | 4.0 | 40-60 hero split, overlapping crop, even triptych, dark reveal band, footer all present and well-proportioned. −1.0: the overlap detail crop is busy and its bottom alignment against the portrait is slightly awkward. |
| Typography | 4.5 | Real **Fraunces** display (92px, `-0.02em`, balanced wrap) + **Inter** body/eyebrow, loaded faces (self-check passed), uppercase tracked meta. −0.5: no external comp to call it pixel-faithful. |
| Color and surface | 4.0 | Cohesive cream `#ece2d4`/ink `#1b1713`/terracotta accent; tasteful image shadows. −1.0: deliberately flat — little depth/gradient/material variety (no glass in this archetype). |
| Spacing rhythm | 4.0 | Consistent gutters and triptych gap, generous section padding. −1.0: the hero→triptych vertical transition could tighten; the reveal band's top margin is large. |
| Responsive behavior | 4.5 | 3→1 col series; nav secondary links hide cleanly (brand persists, **no broken nav**); hero collapses with the portrait full-width. −0.5: the mobile hero overlap crop sits a touch tight. |
| Interaction and motion | 4.5 | **(P5 M3)** Two behaviours now frame-proven: `editorial-1440-reveal.png` (scroll-driven `rise` entrance settled) + `editorial-1440-hover.png` (hero CTA hover end-state). −0.5: built from intent. |
| Asset handling | 4.5 | Real photography throughout — portrait hero + 3 distinct cover-cropped series photos, all stable, focal via `object-position`. −0.5: a couple of series crops are center-top compromises (group scene cropped to 3:4). |
| **Total** | **85.7 / 100** | `30.0 * 20 / 7` (M2 82.9; +1.0 Motion via P5 Lane A) |

---

## saas — SaaS product landing

Target intent:
1. Dark developer-facing billing/usage console marketing page (Linear/Vercel
   idiom) — near-black canvas, radial-glow hero, frosted sticky nav.
2. A glassmorphic "product in context" panel pairing a real photo with a
   monospace usage-contract surface.
3. A feature triad + a three-tier pricing table with a highlighted plan.

Screenshots: `fidelity/saas/saas-1440.png` · `-768.png` · `-390.png` ·
`-1440-scrolled.png` · `-1440-hover.png`

| Axis | Score | Evidence |
|---|---:|---|
| Layout accuracy | 4.5 | Sticky nav, radial-glow hero, 2-col glass panel (photo + code), 3-card feature triad, 3-tier pricing, footer — complete and well-aligned. −0.5: built from intent. |
| Typography | 4.5 | Three real faces — **Geist** headline (`-0.03em`), **Inter** body, **Geist Mono** code surface — with clean hierarchy. −0.5: built from intent. |
| Color and surface | 4.5 | Dark canvas + radial-glow gradient + **backdrop-filter glass** (nav + panel) + mint accent + layered borders/shadows. `saas-1440-scrolled.png` proves the blur composites **over real scrolled content**, not just the initial background. −0.5: glass edge treatment is slightly soft. |
| Spacing rhythm | 4.0 | Desktop cadence is clean and even. −1.0: the 3-col feature + pricing grids are cramped at the 768 tablet width. |
| Responsive behavior | 4.0 | Logo + CTA persist in the nav row, center links hide; panel/features/pricing each collapse to 1 col on mobile. −1.0: tablet keeps 3-col pricing/features, which is dense. |
| Interaction and motion | 4.5 | Best-evidenced motion of the three: `scrolled` proves `position:sticky` pinning + glass over content; `hover` proves the nav CTA's `style.hover` (scale + glow) settles to a real hovered end state. −0.5: no entrance animation in this design. |
| Asset handling | 3.5 | The one real photo (team at a studio desk) is stable and well-cropped 16:9 inside the glass card. −1.5: asset usage is sparse — no product-UI screenshot, and the feature cards are imageless (type + mono index only). |
| **Total** | **84.3 / 100** | `29.5 * 20 / 7` |

---

## agency — Creative production agency

Target intent:
1. Fashion/film production studio — a magazine masthead on near-black, alternating
   ink/bone bands, a Playfair Display masthead over Raleway body.
2. A full-bleed cinematic band + a "selected work" grid that reads like a contact
   sheet (five real-photo cards).
3. A three-tier engagement table on ink.

Screenshots: `fidelity/agency/agency-1440.png` · `-768.png` · `-390.png`

| Axis | Score | Evidence |
|---|---:|---|
| Layout accuracy | 4.5 | Ink masthead hero, full-bleed cinematic band, 3+2 work grid, ink engagement pricing, footer — confident composition; alternating bands read premium. −0.5: built from intent. |
| Typography | 4.5 | Real **Playfair Display** masthead (88px fashion-serif) + **Raleway** body/labels, strong hierarchy and tracking. −0.5: built from intent. |
| Color and surface | 4.0 | Premium ink `#15120e`/bone `#efeae1` alternation + bronze accent; good contrast and band rhythm. −1.0: no depth/glass; the bronze accent is subtle and does little work. |
| Spacing rhythm | 4.5 | Generous, even cadence; the cinematic band + work-grid + pricing rhythm is balanced. −0.5: the bone work section could use slightly more breathing room above the grid. |
| Responsive behavior | 4.5 | Hero/band/grid/pricing all collapse cleanly to 1 col; nav links hide (brand persists); the cinematic band re-crops taller (`2.4`→`1.4`) on mobile. −0.5: 3-col work grid at 768 is a little tight. |
| Interaction and motion | 4.5 | **(P5 M3)** Two behaviours now frame-proven: `agency-1440-hover.png` (hero CTA hover — scale + glow end-state) + `agency-1440-reveal.png` (the "selected work" contact sheet's scroll `rise` settled). Work-card lift hover remains declared-but-uncaptured (hover frame targets the hero CTA). −0.5: built from intent. |
| Asset handling | 4.5 | Richest real-photo usage — cinematic band + 5 distinct cover-cropped work photos, all stable with sensible focal crops. −0.5: a couple of group-shot 4:3 crops are generic. |
| **Total** | **88.6 / 100** | `31.0 * 20 / 7` (M2 84.3; +1.5 Motion via P5 Lane A) |

---

## M1 → M2

| | M1 (baseline) | M2 | Δ |
|---|---:|---:|---:|
| editorial | ~58 (placeholder build) | **82.9** → **85.7 (M3)** | +27.7 |
| saas | ~58 (placeholder build) | **84.3** | +26.3 |
| agency | — (new archetype) | **84.3** → **88.6 (M3)** | new |
| **Blended (3 archetypes)** | **~58** | **M2 83.8 → M3 86.2** | **+28.2** |

> **P5 Lane A (motion capture)** lifted editorial + agency Motion to 4.5 by frame-proving the
> already-declared hover + a new agency scroll-reveal — `(85.7 + 84.3 + 88.6) / 3 = 86.2`. saas was
> unchanged (its motion was already 4.5). Remaining to 90: P5 Lane B closes saas Assets (3.5),
> editorial Layout/Color/Spacing (4.0), agency Color (4.0), and the 768-tablet density.

> `(82.9 + 84.3 + 84.3) / 3 = 83.8`. The blend is the mean of the three
> overalls — **not** a sum of per-axis deltas.

### Why each axis moved — real improvement vs scoring calibration

There is no committed M1 per-axis sheet (M1 is recorded only as the ~58 blended
figure in the lane brief), so this is a qualitative attribution of which axes
drove the +25.8, honestly split between *real* improvement and *calibration*:

- **Asset handling (the biggest real gain).** M1 imagery was `data:` SVG
  placeholders that the renderer **drops to nothing** — Assets was effectively a
  floor. M2 paints real, cover-cropped photography on every archetype. This is
  **100% real improvement**, and it is the single largest contributor.
- **Typography (real gain).** M1 declared system fonts (Georgia/Arial) — scored
  on the wrong glyphs. M2 loads 6 distinct bundled registry faces (Fraunces,
  Inter, Geist, Geist Mono, Playfair Display, Raleway) proven by the capture
  font self-check. **Real improvement**, enabled by Lane A's font bridge.
- **Interaction and motion (mixed: real + calibration).** At M1 this axis was
  "unscoreable" from one static frame and scored near the floor. M2 measures it
  from motion frames. The `saas` sticky + glass-over-content + hover are
  **genuinely new and proven** (real). The fact that motion is now *measurable at
  all* is partly **calibration** — the static-only harness couldn't see it. Note
  the honest asymmetry: `saas` motion is well-proven (4.5), but `agency` motion
  is **built but not frame-captured (3.0)** and `editorial` has only the reveal
  (3.5). I did not award motion credit I couldn't see in a frame.
- **Color and surface (mostly calibration, some real).** The glass component was
  unscoreable from a pre-scroll frame at M1; the `scrolled` frame now proves the
  backdrop-filter composites over moving content. The palettes themselves are a
  modest real improvement.
- **Responsive (real gain).** M1's mobile nav dropped links into nothing; M2
  hides secondary links gracefully while keeping brand/CTA, and every grid
  collapses to a single column with hierarchy intact.
- **Layout / Spacing (real, modest).** Composition is more deliberate, but these
  were already mid-band at M1, so the movement here is smaller.

**Net honest read:** roughly **two-thirds real improvement** (assets, fonts,
responsive, composition) and **one-third calibration** (glass + motion becoming
*measurable* via the motion frames). The number is on-target with the P4 plan's
prediction that design rebuilds using fonts + media would reach ~85; landing at
**83.8** is deliberately conservative (no 5.0s, motion credited only where a
frame proves it).

## What still loses points (blunt)

- **Motion is thin where it isn't frame-proven.** Only `saas` has captured
  hover + sticky + glass. `agency`'s hover-lift cards and `editorial`'s CTA hover
  are coded but not captured, so they score as near-static. Adding an
  `agency hover` + an `editorial hover` motion frame (and a sticky element to one
  of them) is the cheapest path to +0.5–1.0 on two designs.
- **Tablet density on `saas`.** Keeping pricing + features at 3 columns at 768px
  is cramped; dropping to 2 columns at tablet would lift Spacing + Responsive.
- **`saas` asset sparsity.** One photo + a code block. A real product-UI asset
  (or a second photo in the feature row) would lift Assets from 3.5.
- **Container queries are exercised but barely visible.** Each gallery/work card
  sets `container-type:inline-size` + a `containerQueries.mobile` caption step,
  but in a static frame this is hard to distinguish from viewport-responsive
  behavior — capability is proven in the markup, not dramatically in pixels.
- **No 5.0s, by design.** These are built from archetype intent, not matched to a
  named reference; closing the last 0.5 per axis needs a specific comp to grade
  against.

## NEEDS HUMAN EYES

- Whether the editorial hero overlap crop reads as intentional or busy.
- Cross-machine golden seeding: the committed `e2e/fidelity` PNGs are CI-seeded
  on macos-14. These M2 frames were captured on a dev mac, so the goldens for the
  new/rebuilt designs must be reseeded via the `builder-fidelity.yml`
  `workflow_dispatch (update_snapshots=true)` path before the suite is green on
  CI. `capture.ts`'s 0-byte determinism self-test is the same-machine truth and
  passes for all four designs.
