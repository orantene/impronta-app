# Builder → 2027 Flexibility Plan

**Closing the last ~33%: "mimic any design, world-class UX, proven."**

Status: binding plan · Created 2026-05-31 · Owner: builder marathon
Supersedes nothing. Sits downstream of the shipped escape-hatch + Living-Components work (PRs through #128).

---

## 0. The honest premise

After the escape-hatch marathon and the 4-lane quality pass (PR #128), the builder sits at **~67/100** against the bar "world-class page builder that can mimic any design." That number is a weighted average, not a feature count — and per our scoring rule it must stay that way: **do not sum per-track gains into the overall.** A track that takes one dimension from 5→9 moves the overall by ~1–2 points, not 4.

The remaining ~33% is the part that **cannot be manufactured by adding more style escapes.** We already have ~27 escape properties and broad CSS reach (capability is the *strong* dimension at 8/10). The gap is everywhere else:

| Dimension | Now | Target | The actual gap |
|---|---|---|---|
| Capability (can you express it?) | 8 | 9 | A few real missing primitives: font *loading*, video/embed/icon/code nodes, CSS transitions, container queries |
| Editor UX (is it pleasant + fast?) | 6 | 9 | Multi-select, align/distribute, group, keyboard, undo/redo robustness, canvas↔publish parity |
| Reliability (does it hold up?) | 6.5 | 9 | Large-tree perf, cross-browser, autosave/conflict, no silent truncation |
| "Any design" (proven breadth) | 6.5 | 9 | **Unproven** — we have never rebuilt a real-world design in it end-to-end |
| Content workflows (dynamic data) | 5 | 9 | Repeaters/collections, field-level binding, real media library — the **weakest** dimension |
| Proven quality (evidence) | 6 | 9 | No visual-regression, no real-host QA matrix, no fidelity benchmark |

**Realistic trajectory** (overall, weighted — not additive):
`67 → ~75 (Phase 1–2) → ~82 (Phase 3) → ~90 (Phase 4)`. The last 10 points (90→100) are asymptotic: they come from real users hitting real edges, not from a plan. We stop the plan at "demonstrably 90."

---

## 1. The spine: a Design-Fidelity Proof Harness (Track A)

Every other track is guesswork until we **try to rebuild real designs and log every wall we hit.** Track A is both the measurement instrument and the backlog generator. It runs first and re-runs after every phase.

### A.1 — Fidelity rubric (build once)
Score each rebuild 0–5 on seven axes, screenshot-diffed against the reference at **3 breakpoints** (1440 / 768 / 390):

1. Layout accuracy (structure, overlap, alignment)
2. Typography (faces, scale, leading, tracking)
3. Color & surface (gradients, glass, shadows, blend)
4. Spacing rhythm (the thing that screams "template" when wrong)
5. Responsive behavior (does it reflow like the original)
6. Interaction & motion (scroll, hover, entrance, sticky)
7. Asset handling (imagery quality, focal points, srcset)

Fidelity score = mean × 20 → a 0–100 number per design. **This is the headline metric for the whole plan.**

### A.2 — Five reference designs (stress different axes)
Chosen to cover the space, biased toward Tulala's actual market (talent / agency / editorial):

1. **Luxury editorial / photography portfolio** — full-bleed imagery, asymmetric overlap, oversized type, scroll reveals. *(Tulala's home turf.)*
2. **SaaS marketing landing (Linear/Stripe-class)** — precise spacing, gradient + glass surfaces, sticky nav, feature grids, dark mode.
3. **Editorial magazine** — multi-column text, pull quotes, dense responsive grids.
4. **Commerce / product page** — cards, **repeaters from data**, gallery, sticky buy box. *(Forces Track D.)*
5. **Experimental brand site** — transforms, blend modes, custom cursor, sticky scroll sections, marquee.

> Use original/representative layouts, not pixel-copies of a specific company's site (no copyright reproduction). The goal is to stress the *capabilities a class of design needs*, not to clone one brand.

### A.3 — Triage every gap
Each rebuild emits two lists: **CAN'T** (capability missing → Track B), and **PAINFUL** (possible but slow/awkward → Track C/D). Tag perf observations → Track E. This is the empirical backlog; everything below in B/C/D is the *predicted* backlog and will be reconciled against A's *actual* findings.

### A.4 — Re-score after each phase
The fidelity numbers must trend up. If a track lands and fidelity doesn't move, the track was mis-prioritized — correct course.

**Acceptance:** 5 designs rebuilt; each scored at 3 breakpoints; gap backlog triaged and linked to tracks.

---

## 2. Track B — Capability completeness

Grounded in an actual scan of the node union + style schema (2026-05-31), **not** guesses. Most CSS escapes already exist; these are the genuine holes.

> **Verified-first rule:** every item says whether the primitive exists today. Build only what's confirmed missing.

### B.1 — Font loading + picker  *(property exists, loading does not)*
`fontFamily` is already a free string (`z.string().max(160)`), so you *can* type a stack — but nothing **loads** a non-system font, so "mimic any design" dies at step one (typography is fidelity axis #2). Build:
- A font picker UI (system stack + curated Google Fonts subset).
- Actual font loading (`<link>`/`@font-face` injection on published page + editor canvas).
- Custom font upload (woff2) → stretch, gated to a paid tier.
**Impact: high.** This single item likely moves "any design" fidelity more than any other capability.

### B.2 — New node kinds  *(absent from the union)*
The union has 17 kinds; none of these exist and all are table-stakes for real sites:
- **video** (file + poster, autoplay/muted/loop)
- **embed / iframe** (YouTube, Vimeo, Maps, Calendly, arbitrary) — sandbox + CSP review required
- **icon / SVG** (inline SVG node or icon-set picker)
- **code / raw-HTML** (escape hatch for the truly bespoke; owner-gated, sanitized)
Each new kind needs: type union + zod schema + render path + a render-output regression test + element-library entry.

### B.3 — First-class transitions  *(only entrance animation exists)*
`transition*` is wired to the entrance-animation system, but there's no first-class CSS **transition** control (property/duration/timing/delay) for state changes. The hover system exists but transitions between states are not authorable. Add transition controls so hover/state changes can ease.

### B.4 — Container queries  *(containerType: 0 hits)*
Breakpoints are viewport-only. 2027 responsive is **container queries** — a component that adapts to *its slot's* width, not the screen's. Add `container-type`/`container-name` + a `@container` rule path mirroring the existing 3-piece breakpoint mechanism. Medium lift, high "2027" signal.

### B.5 — Multi-layer backgrounds + gradient builder
Single background today. Real designs layer gradient-over-image, multiple images, noise overlays. Add layered background list + a multi-stop gradient builder UI (vs. raw string).

### B.6 — Long-tail (do only if Track A surfaces them)
Multi-column text (`column-count`), `writing-mode`, pseudo-element decorative layers, shape masks from a library. **Don't pre-build — wait for A.3 to prove demand.**

**Acceptance:** every CAN'T item from A.3 either shipped (with a regression test) or explicitly deferred with a reason logged.

---

## 3. Track C — World-class editor UX

Direct manipulation (9 gestures) and the collapsible inspector (Q2) already landed. This is the polish that separates "powerful" from "world-class."

- **C.1 Multi-select + group/ungroup** — marquee-select, shift-click, move/style many at once, group into a container. *(Biggest single UX lift.)*
- **C.2 Align & distribute toolbar** — left/center/right/top/middle/bottom + distribute, relative to selection or parent. Smart guides already exist for single nodes; extend to multi.
- **C.3 Keyboard completeness** — copy/cut/paste (incl. **across pages**), duplicate, delete, nudge (+shift = 10px), select-parent/child, a discoverable shortcut sheet.
- **C.4 Undo/redo robustness audit** — verify multi-step, cross-selection, cross-page, and style-vs-structure operations all undo cleanly. *(Overlaps Track E reliability; treat as a gate.)*
- **C.5 Canvas ↔ publish parity** — the instance-override panel admits overrides only show "after publish." Any divergence between editor canvas and published render is a world-class blocker. Audit and close. The render-output suite is the oracle.
- **C.6 Inspector intelligence** — contextual fields (hide inapplicable controls per node kind), unit steppers, "link to token" on every color/space field, computed-value readouts.
- **C.7 Stretch: screenshot → scaffold** — paste a reference image, AI proposes a node tree. High-wow, gated, last.

**Acceptance:** every PAINFUL item from A.3 addressed or deferred; a new builder user can place, align, and style a 3-section page without touching raw CSS strings.

---

## 4. Track D — Content workflows  *(weakest dimension — the real unlock)*

`dataBinding` already exists on sections **and** containers (powers the directory/roster grid). The gap is **generalizing** it from one curated use into an authorable system. This is the biggest lift and the largest score mover for "any design that shows real data."

- **D.1 Generalized repeater/collection** — bind any container to a data source; it repeats a **template child** per row. (The directory grid is the proof-of-concept; lift the pattern up.)
- **D.2 Field-level binding** — bind any text/image/href on a template node to a record field (`{{ field }}`), with a fallback. Reuses the override-resolution machinery from Living Components Phase 3.
- **D.3 Real media library** — assets-drawer + media-picker exist; add folders, search, alt-text, focal point (`objectPosition` already there), and responsive `srcset` generation.
- **D.4 Global tokens UI** — theme tokens cascade already shipped; add an authoring surface (palette, type scale, spacing scale) + theme switching (light/dark) as first-class.
- **D.5 Simple content model** — a lightweight collection schema so non-curated content (posts, projects, team) can be authored once and rendered many ways. *(Needs one migration — single-agent, timestamped.)*

**Acceptance:** the commerce reference design (A.2 #4) renders its product grid from a data source via an authorable repeater, not hand-placed cards.

---

## 5. Track E — Performance + reliability proof

- **E.1 PERF-1 (carried over)** — `BUILDER_NODE_RENDERER_CSS` (~4KB) injects per `renderBuilderNodes` call → N duplicate `<style>` tags per page. Move to a single per-page provider + skip-injection flag. *(Real but gzip-cheap; do it as the first easy win of this track.)*
- **E.2 Large-tree budget** — define + enforce a budget: edit/render a 200-node page under a target frame time; virtualize the navigator tree if needed. Extend `performance-budget.test.ts`.
- **E.3 Visual-regression CI** — extend the deterministic `render-output.test.ts` pattern into **pixel** diffs: snapshot the 5 reference rebuilds at 3 breakpoints, diff on every PR. This is how "proven quality" stops being a claim.
- **E.4 Cross-browser pass** — the escapes (clip-path, mask, backdrop-filter, scroll-driven animation, container queries) on Safari + Firefox + Chrome. Log + polyfill/fallback where they diverge.
- **E.5 Autosave / conflict / oversize guards** — and **GAP-1**: the published loader silently truncates at `limit(500)`. Replace silent truncation with a logged, surfaced cap (no-silent-caps rule).
- **E.6 Absorb Q4 deferred** — fold GAP-2..4, TEST-1..4, UX-1/2 from the QA-lane report into the relevant track above; none are P1 but they're free quality.

**Acceptance:** visual-regression gate live on PRs; large-tree budget enforced; cross-browser matrix documented; no silent truncation anywhere.

---

## 6. Track F — Test & QA discipline (cross-cutting)

The non-negotiable habit, not a phase:
- Every new primitive (Track B) ships with a `renderToStaticMarkup` regression test in `render-output.test.ts`.
- Every bug found ships with a reproducing test first (the BUG-1 pattern from PR #128).
- The gate stays: `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit && npm run lint && npm run test:builder-node-bindings` + the suite the change touches.

---

## 7. Sequencing & gates

Phases are gated on fidelity re-scores, not calendar.

**Phase 1 — Instrument & prove (start here)**
A.1 rubric → A.2 rebuild **2** designs (editorial + SaaS) → A.3 triage. In parallel: E.1 (PERF-1) + E.3 (visual-regression harness) as enablers.
*Gate: baseline fidelity scores recorded; real backlog exists.*

**Phase 2 — Capability + UX from the proven backlog**
Track B (font loading B.1 first; then the node kinds + transitions that A.3 proved) + Track C top three (C.1 multi-select, C.2 align, C.3 keyboard).
*Gate: re-score the 2 designs; fidelity up; overall ~75.*

**Phase 3 — Content workflows (the big lift)**
Track D end-to-end. One migration, single-agent, timestamped.
*Gate: commerce design renders its grid from data; overall ~82.*

**Phase 4 — Breadth + hardening**
A.2 remaining **3** designs → reconcile backlog → Track E (perf/cross-browser) + Track C polish (C.4 undo audit, C.5 parity, C.6 inspector).
*Gate: all 5 designs ≥ 85 fidelity at all 3 breakpoints; overall ~90. Stop.*

---

## 8. What this plan deliberately does NOT do

- **No additive scoring theater.** Per-dimension gains report per-dimension; the overall stays a weighted average.
- **No building Track B/D items A.3 didn't prove we need.** The reference rebuilds are the authority; this doc's predicted backlog yields to the empirical one.
- **No parallel mockups / no staging forks.** Pre-launch shipping rules: one canonical builder, straight to prod behind the existing gates, QA on a seeded host.
- **No "tsc-clean = done."** Done = demonstrated fidelity on a real rebuild, screenshot-proven.

---

## 9. First action (for whoever picks this up)

1. Branch off latest `main`.
2. Build A.1 (the rubric) as a short checklist doc + a screenshot-diff harness wired into the render-output pattern.
3. Rebuild reference design #1 (editorial portfolio) in the builder on a seeded host; score it; **write down every wall.**
4. That wall-list is Phase 2's real input. Reconcile it against §2–§4 and start.
