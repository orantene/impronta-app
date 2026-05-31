# Builder → 2027 Flexibility — Execution Plan

**Closing the last ~33%: "mimic any design, world-class UX, proven."**

Status: **binding execution plan** · Created 2026-05-31 · Owner: builder marathon (Opus integrator)
Downstream of the shipped escape-hatch + Living-Components work (PRs through #128).
This is the run-it document: phases, named agent lanes, effort, timeline, gates, risks.

---

## 1. Executive summary

The builder is at **~67/100** against "world-class, can mimic any design." Capability (raw CSS reach) is already strong at 8/10 — the remaining 33% lives in **proof, editor UX, dynamic content, and reliability**, none of which can be bought with more style escapes.

The plan is built around one spine — **a Design-Fidelity Proof Harness** that rebuilds real designs and converts "any design" from opinion into a measured number — feeding four delivery tracks across **4 phases / ~12 integration waves**, executed by **file-disjoint agent lanes** under an Opus integrator, shipped straight to prod behind the existing gate.

**Headline roadmap:**

| Phase | Theme | Waves | Lanes | Effort (lane-sessions) | Overall score (weighted) | Exit gate |
|---|---|---|---|---|---|---|
| **P1** | Instrument & Prove | 2 | 5 | ~6 | 67 → **~70** | Baseline fidelity numbers exist; backlog triaged |
| **P2** | Capability + UX | 4 | 9 | ~13 | 70 → **~76** | 2 designs re-scored up; CAN'T-list closed |
| **P3** | Content Workflows | 3 | 6 | ~11 | 76 → **~83** | Commerce grid renders from data; migration on prod |
| **P4** | Breadth + Hardening | 3 | 10 | ~12 | 83 → **~90** | All 5 designs ≥85 fidelity @ 3 breakpoints; **STOP** |
| | **Total** | **~12** | **30** | **~42** | **67 → ~90** | |

**Indicative calendar** (cadence is the lever — see §7):

| Cadence | Waves/week | End-to-end |
|---|---|---|
| Fast-track (marathon, back-to-back) | ~5 | **~2.5 weeks** |
| Sustainable (default assumption) | ~3 | **~4–5 weeks** |
| Conservative (1 push/day, heavy QA) | ~2 | **~6 weeks** |

> Per our scoring rule: per-dimension gains are **never** summed into the overall. The overall is a weighted average; a 5→9 on one dimension moves it ~1–2 points. The last 10 points (90→100) are asymptotic and left to real users — the plan stops at "demonstrably 90."

---

## 2. Scorecard & trajectory

| Dimension | Weight | Now | P1 | P2 | P3 | P4 | The actual gap being closed |
|---|---|---|---|---|---|---|---|
| Capability | 18% | 8.0 | 8.0 | 8.7 | 8.8 | 9.0 | Font *loading*, video/embed/icon/code nodes, transitions, container queries |
| Editor UX | 22% | 6.0 | 6.0 | 7.0 | 7.2 | 8.8 | Multi-select, align/distribute, keyboard, undo audit, canvas↔publish parity |
| Reliability | 18% | 6.5 | 6.8 | 7.0 | 7.5 | 9.0 | Large-tree perf, cross-browser, autosave/conflict, no silent truncation |
| "Any design" (proven) | 20% | 6.5 | 7.0 | 7.8 | 8.4 | 9.0 | **Unproven today** — proven only by rebuilding real designs |
| Content workflows | 12% | 5.0 | 5.0 | 5.2 | 8.5 | 9.0 | Repeaters, field binding, media library — **weakest dimension** |
| Proven quality | 10% | 6.0 | 7.0 | 7.5 | 8.0 | 9.0 | Visual-regression CI, real-host QA matrix, fidelity benchmark |
| **Weighted overall** | | **~67** | **~70** | **~76** | **~83** | **~90** | |

The weakest two dimensions (content 5.0, editor-UX 6.0) are the biggest movers — they get the heaviest phases (P3, P2/P4 respectively).

---

## 3. Strategy in one screen (the five tracks)

- **Track A — Fidelity Proof Harness (spine).** Rebuild 5 real-world reference designs, score each on a 7-axis rubric at 3 breakpoints (1440/768/390). The score is the headline metric; the walls hit are the backlog. Runs in P1 (2 designs) and P4 (3 designs), re-scores after every phase.
- **Track B — Capability.** Close the genuine primitive holes (scan-verified, not guessed): font loading, new node kinds, CSS transitions, container queries, layered backgrounds.
- **Track C — Editor UX.** Multi-select/group, align & distribute, keyboard, undo/redo audit, canvas↔publish parity, inspector intelligence.
- **Track D — Content workflows.** Generalize the existing `dataBinding` into authorable repeaters + field-level binding + a real media library + global tokens + a light content model.
- **Track E — Perf & reliability.** PERF-1 CSS dedup, large-tree budget, **visual-regression CI**, cross-browser, kill silent truncation.
- **Track F — Test discipline (cross-cutting).** Every primitive ships a `render-output.test.ts` regression; every bug ships a failing test first.

Full strategic detail for each track is in §11 (Appendix). The execution detail is §5–§6.

---

## 4. Agent roster, model policy & effort model

### 4.1 Roster (reusable across phases)

| Agent | Role | Default model | Why this tier |
|---|---|---|---|
| **Integrator** | FF-only merges, gate, deploy, re-score, course-correct | Opus | Cross-lane judgment, conflict resolution, ship decisions |
| **Fidelity Agent (A)** | Build rubric + harness; rebuild & score designs | Opus | Interactive, design-judgment, browser-driven QA |
| **Capability Agent (B1…Bn)** | New escapes / node kinds + render path | Sonnet (high) | Bounded, well-specified, pattern-replicating |
| **Editor-UX Agent (C1…Cn)** | Direct-manip, inspector, keyboard | Opus for ambiguous UX (multi-select, parity); Sonnet for bounded (align toolbar, keyboard map) | Mixed — judgment vs. mechanical |
| **Content/Data Agent (D1…Dn)** | Repeaters, binding, schema/migration | Opus (high) | Architecture + data-model + migration risk |
| **Perf/Reliability Agent (E1…En)** | Dedup, budgets, visual-regression CI, cross-browser | Sonnet (high) | Bounded, measurable |
| **Render-Test Agent (F)** | Regression tests per primitive | Sonnet (medium) | Mechanical, deterministic |

**Model policy:** Sonnet for work with a crisp spec and a clear oracle (a test, a budget, a pattern to copy). Opus where the work is ambiguous, interactive, architectural, or requires taste (rebuilds, multi-select, repeater design, integration).

### 4.2 Effort units

- **Lane-session** = one focused agent run producing one PR-sized deliverable (≈ what each Q1–Q4 quality lane did). The atomic estimate unit.
- T-shirt → lane-sessions: **S** ≈ 0.5 · **M** ≈ 1 · **L** ≈ 1.5–2 · **XL** ≈ 2–3 (XL lanes are split when possible).
- **Wave** = a set of file-disjoint lanes run concurrently + **one** integration pass (gate + merge + re-score).

### 4.3 Hot-file contention map (the #1 coordination constraint)

These files are touched by many lanes and **cannot have two concurrent owners**:

| File | LOC | Touched by | Rule |
|---|---|---|---|
| `builder-node/render.tsx` | 1,707 | every Track B lane | **One owner per wave.** Capability lanes serialize through it (a "capability train"). |
| `builder-node/types.ts` | 520 | every new prop / node kind | Additive edits; integrator resolves (usually clean union extensions). |
| `builder-node/registry.ts` | 673 | every new prop / node kind | Same — paired zod edits. |
| `inspectors/style-panel.tsx` | 8,481 | every new control | One owner per wave; UX lanes that don't add controls avoid it. |
| `edit-chrome/selection-layer.tsx` | 3,712 | direct-manip / multi-select | C-lane owned; B/D lanes never touch. |
| `edit-chrome/edit-context.tsx` | 4,939 | new actions | One owner per wave. |

**Consequence:** capability work (Track B) is *semi-serial* on `render.tsx`/`types.ts`/`registry.ts`. The plan models it as **two capability trains** (each serial internally, the two trains disjoint by node-kind file slices) rather than N fully-parallel lanes.

---

## 5. Phase-by-phase execution plan

> Each lane lists: **ID · owner(agent, model, effort) · deliverable · files · acceptance · depends-on.**
> Every code lane ends in the standard gate: `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit && npm run lint && npm run test:builder-node-bindings` (+ the suite it touches). Every PR is file-disjoint within its wave.

### PHASE 1 — Instrument & Prove  *(2 waves · ~6 lane-sessions · 67→~70)*

Goal: stop guessing. Produce baseline fidelity numbers + the empirical backlog. Land the two enablers (CSS dedup, visual-regression CI) that every later phase relies on.

**Wave 1.1** (parallel)
- **P1-L1 · Fidelity Harness** · *Fidelity Agent A · Opus · L* — Build the 7-axis rubric + a screenshot-diff harness (`scripts/fidelity-capture.mjs`: Playwright captures editor + published at 1440/768/390, pixel-diffs vs a reference image, emits a score sheet). Deliverable: `web/docs/fidelity-rubric.md`, the script, a `fidelity/` results dir. Files: `scripts/`, `web/docs/`. Acceptance: one dry-run on the current homepage produces a scored report. Depends-on: —.
- **P1-L4 · PERF-1 CSS dedup** · *Perf Agent E · Sonnet high · M* — Single per-page renderer-CSS provider + skip-injection flag so `BUILDER_NODE_RENDERER_CSS` emits once, not per section. Files: `render.tsx` (owner this wave), `homepage-cms-sections.tsx`, PublishedShell. Acceptance: a multi-section page emits exactly one `<style data-builder-node-renderer-styles>`; render-output suite green. Depends-on: —.

**Wave 1.2** (parallel; rubric ready)
- **P1-L2 · Rebuild #1 — Editorial portfolio** · *Fidelity Agent A · Opus · L* — Rebuild on a seeded host; score @ 3 breakpoints; log every CAN'T/PAINFUL. Files: content only (no code). Acceptance: scorecard + triaged gap list committed to `fidelity/editorial.md`. Depends-on: L1.
- **P1-L3 · Rebuild #2 — SaaS landing** · *Fidelity Agent A2 · Opus · L* — Same. Acceptance: `fidelity/saas.md`. Depends-on: L1.
- **P1-L5 · Visual-regression CI** · *Perf Agent E2 · Sonnet high · M* — Wire the harness into a GH Action that diffs the rebuilds on every PR; fail on >X% drift. Files: `.github/workflows/`, `scripts/`. Acceptance: CI posts a diff artifact on a test PR. Depends-on: L1.

**Integration 1:** gate + merge + record **baseline fidelity numbers**; reconcile §11 predicted backlog against the real CAN'T/PAINFUL lists → finalize P2 scope.
**Milestone M1 — "We have a number."**

> ⚠️ Rebuild lanes are the **riskiest** (interactive, browser-flaky). QA method: seed a host in `agency_domains` (raw `*.vercel.app` 404s), drive via Preview/Chrome tools, fall back to deterministic `renderToStaticMarkup` checks for anything the browser can't confirm. Budget a retry per rebuild lane.

---

### PHASE 2 — Capability + UX  *(4 waves · ~13 lane-sessions · 70→~76)*

Goal: close the CAN'T list (Track B) and the top PAINFUL items (Track C). Two **capability trains** serialize on `render.tsx`; UX lanes run truly parallel on disjoint files.

**Capability Train α** (serial on render/types/registry — owns them across 2.1→2.2)
- **P2-L1 · Font loading + picker** · *Capability B1 · Sonnet high · L* — Font picker UI + `@font-face`/`<link>` injection on editor canvas **and** published page + a curated Google-Fonts registry. (`fontFamily` is already free-string; this makes fonts actually *load*.) Files: `style-panel.tsx` typography, `render.tsx`, new `fonts-registry.ts`. Acceptance: a non-system font renders identically in editor + publish; render-output test. **Highest single fidelity mover.** Depends-on: —.
- **P2-L2 · Node kinds: `video` + `embed`** · *Capability B2 · Sonnet high · L* — Type union + zod + render + element-library + **CSP/iframe sandbox review**. Files: `types.ts`, `registry.ts`, `render.tsx`, element-library. Acceptance: a YouTube embed + a self-hosted video render + pass CSP; regression tests. Depends-on: L1 land (train order).

**Capability Train β** (disjoint node-kind slice; can run alongside α if integrator splits render.tsx by node-kind region, else wave-offset)
- **P2-L3 · Node kinds: `icon`/SVG + `code`/raw-HTML** · *Capability B3 · Sonnet high · M* — Owner-gated, sanitized HTML; icon-set picker. Files: `types.ts`, `registry.ts`, `render.tsx`, a sanitizer util. Acceptance: inline SVG + sanitized HTML render; XSS test. Depends-on: —.
- **P2-L4 · First-class CSS transitions** · *Capability B4 · Sonnet medium · M* — transition property/duration/timing/delay controls via the 3-piece mechanism, so hover/state changes ease. Files: `types.ts`, `registry.ts`, `render.tsx`, `style-panel.tsx`. Acceptance: a hover color change eases; render-output test. Depends-on: —.
- **P2-L5 · Container queries** · *Capability B5 · Sonnet high · L* — `container-type`/`container-name` + a `@container` rule path mirroring the breakpoint mechanism. Files: `render.tsx`, `style-panel.tsx`, `types.ts`. Acceptance: a card adapts to its slot width, not the viewport; test. **Strongest "2027" signal.** Depends-on: —.

**UX lanes** (truly parallel — different files)
- **P2-L6 · Multi-select + group/ungroup** · *Editor-UX C1 · Opus high · XL* — Marquee-select, shift-click, multi-move/style, group into container. Files: `selection-layer.tsx`, `edit-context.tsx`. Acceptance: select 3 nodes, move/restyle together, group/ungroup, undo. **Biggest single UX lift.** Depends-on: —.
- **P2-L7 · Align & distribute toolbar** · *Editor-UX C2 · Sonnet high · M* — 6-way align + distribute, relative to selection or parent; extend existing smart guides to multi. Files: `selection-layer.tsx` (after C1), a toolbar component. Acceptance: align/distribute a multi-selection. Depends-on: L6 (soft).
- **P2-L8 · Keyboard completeness + cross-page paste** · *Editor-UX C3 · Sonnet high · M* — copy/cut/paste (incl. across pages), duplicate, delete, nudge (+shift=10px), select parent/child, shortcut sheet. Files: `edit-context.tsx` (coordinate with C1 ownership), a keymap module. Acceptance: copy a node on page A, paste on page B. Depends-on: L6 (soft, shared file).

**Cross-cutting**
- **P2-L9 · Render-test coverage** · *Render-Test F · Sonnet medium · M* — A regression test for every new primitive from L1–L5. Files: `render-output.test.ts`. Runs in the last wave. Depends-on: L1–L5.

**Waves:** 2.1 = {L1, L3, L6} · 2.2 = {L2, L4, L7} · 2.3 = {L5, L8} · 2.4 = {L9 + integration}.
**Integration 2:** gate + merge + **re-score designs #1–#2** (must trend up). 
**Milestone M2 — "Capability complete; editing feels modern."**

---

### PHASE 3 — Content Workflows  *(3 waves · ~11 lane-sessions · 76→~83)*

Goal: lift the weakest dimension. Generalize the existing `dataBinding` (sections + containers, today only the directory/roster grid) into an authorable system. **One migration — single agent, timestamped, `db:push` before merge.**

**Wave 3.1**
- **P3-L1 · Generalized repeater engine** · *Content D1 · Opus high · XL* — Bind any container to a data source; it repeats a **template child** per row. Reuses `dataBinding` + the Phase-3 instance-resolution machinery. Files: `component-instances.ts`/new `repeater.ts`, `render.tsx`, `snapshot-tree.ts`. Acceptance: a container bound to N rows renders N copies of its template; render-output test. **Core unlock.** Depends-on: —.
- **P3-L3 · Media library depth** · *Content D3 · Sonnet high · L* — Folders, search, alt-text, focal point (`objectPosition` exists), responsive `srcset` generation. Files: `assets-drawer.tsx`, `media-picker-dialog.tsx`, `media-picker-button.tsx`. Acceptance: upload→organize→insert with srcset. Depends-on: — (disjoint from L1).
- **P3-L4 · Global tokens UI + theme switching** · *Content D4 · Sonnet high · L* — Authoring surface for palette / type scale / spacing scale + light/dark switch (the token cascade already ships). Files: a tokens panel, theme provider. Acceptance: edit a token → cascades live; toggle dark. Depends-on: — (disjoint).

**Wave 3.2**
- **P3-L2 · Field-level binding** · *Content D2 · Opus high · L* — Bind any text/image/href on a template node to a record field (`{{ field }}`) with fallback; reuses override-resolution. Files: `component-instances.ts`/`repeater.ts`, `render.tsx`, `style-panel.tsx` binding UI. Acceptance: a card's heading/image/link bind to fields; missing-field fallback test. Depends-on: **L1**.
- **P3-L5 · Content model + migration** · *Content D5 · Opus high · L* — Lightweight collection schema so non-curated content (posts/projects/team) is authored once, rendered many ways. **One Supabase migration**, `date -u +%Y%m%d%H%M%S`, `npm run db:push` **before** merge. Files: `supabase/migrations/`, a collections data layer. Acceptance: create a collection, add rows, bind a repeater to it; `db:check` clean. Depends-on: L1 (soft).

**Wave 3.3**
- **P3-L6 · Render-tests + integration** · *Render-Test F · Sonnet medium · M* — Repeater/binding regression tests. Files: `render-output.test.ts`, `component-instances.test.ts`.

**Integration 3:** gate + **`db:push` verified on remote** + merge + `deploy:smoke` confirms **zero migration drift** + **re-score**. 
**Milestone M3 — "A page renders from data."** (Commerce reference grid is data-driven, not hand-placed.)

> ⚠️ Schema+code shipping protocol (CLAUDE.md): the migration must be applied to remote Supabase **before** the production merge, or prod 500s on the data feature. `deploy:smoke` reports drift — run it.

---

### PHASE 4 — Breadth + Hardening  *(3–4 waves · ~12 lane-sessions · 83→~90)*

Goal: prove all 5 designs, harden, polish to world-class. Then **stop**.

**Wave 4.1** (rebuilds — parallel, content-only)
- **P4-L1/L2/L3 · Rebuild #3 magazine / #4 commerce / #5 experimental** · *Fidelity Agent A ×3 · Opus · L each* — Score @ 3 breakpoints; reconcile remaining gaps into L10. Acceptance: 3 scorecards in `fidelity/`. Depends-on: P3 (commerce needs repeaters).

**Wave 4.2** (hardening — parallel, disjoint)
- **P4-L4 · Large-tree perf budget + navigator virtualization** · *Perf E · Sonnet high · L* — Enforce a budget (edit/render a 200-node page under target frame time); virtualize the navigator. Files: navigator, `performance-budget.test.ts`. Acceptance: budget test green at 200 nodes. Depends-on: —.
- **P4-L6 · Undo/redo robustness audit** · *Editor-UX C · Opus high · L* — Verify multi-step / cross-selection / cross-page / style-vs-structure all undo cleanly. Files: `edit-context.tsx` history. Acceptance: a scripted 20-op sequence undoes to identity. **Reliability gate.** Depends-on: —.
- **P4-L9 · Absorb Q4 deferred + no-silent-truncation** · *Perf E3 · Sonnet medium · M* — GAP-1 (loader truncates silently at `limit(500)` → log + surface the cap) + GAP-2..4, TEST-1..4, UX-1/2 from the PR #128 QA report. Files: `builder-components-loader.ts`, misc. Acceptance: cap is logged; deferred items closed or re-deferred with reason. Depends-on: —.

**Wave 4.3** (polish — parallel, disjoint)
- **P4-L5 · Cross-browser pass** · *Perf E2 · Opus medium · M* — Escapes (clip-path, mask, backdrop-filter, scroll-driven animation, container queries) on Safari + Firefox + Chrome; log + add fallbacks. Acceptance: matrix doc + fallbacks for divergences. Depends-on: —.
- **P4-L7 · Canvas↔publish parity audit** · *Editor-UX C2 · Opus high · M* — Close any editor-vs-published divergence (the override-panel "previews after publish" note). Oracle: render-output suite. Acceptance: parity test across the 5 rebuilds. Depends-on: —.
- **P4-L8 · Inspector intelligence** · *Editor-UX C3 · Sonnet high · L* — Contextual fields (hide inapplicable per node kind), unit steppers, link-to-token on every color/space field, computed-value readouts. Files: `style-panel.tsx` (owner this wave). Acceptance: inspector shows only applicable controls per kind. Depends-on: —.
- **P4-L10 · Final gap closure** · *Capability B · Sonnet high · M* — Whatever rebuilds #3–5 surfaced (the L1/L2/L3 reconcile). Files: per-gap. Depends-on: L1–L3.

**Integration 4:** gate + merge + **final re-score of all 5**. 
**Milestone M4 — "Demonstrably ~90."** All 5 designs ≥85 fidelity at all 3 breakpoints. **Plan complete; stop and hand the last 10 points to real users.**

---

## 6. Effort & lane summary

| Phase | Opus lane-sessions | Sonnet lane-sessions | Total | Wall-clock (sustainable) |
|---|---|---|---|---|
| P1 | 3 (A×3) | 2 (E×2) | ~6 | ~1 week |
| P2 | 3 (C1, C2 split, F-coord) | 9 (B×5, C2/C3, F) | ~13 | ~1.5 weeks |
| P3 | 5 (D1, D2, D5) | 5 (D3, D4, F) | ~11 | ~1 week |
| P4 | 7 (A×3, C×3, E2) | 5 (E, E3, C3, B) | ~12 | ~1 week |
| **Total** | **~18** | **~21** | **~42** | **~4–5 weeks** |

Roughly **40/60 Opus/Sonnet** — Opus concentrated on rebuilds, multi-select, the repeater engine, audits, and integration; Sonnet on the bounded capability/test/CI work.

---

## 7. Timeline & cadence

The schedule is **wave-driven, not calendar-driven** — wall-clock is a function of how many waves/week you run. One wave = parallel lanes + one integration pass.

```
Week 1    │ P1 ███████  (W1.1 → W1.2 → Int1)              M1: baseline number
Week 2   │ P2 ██████████ (W2.1 → W2.2)
Week 3   │ P2 ██████  (W2.3 → W2.4 → Int2)                M2: capability + modern editing
Week 4   │ P3 ██████████ (W3.1 → W3.2 → W3.3 → Int3)      M3: data-driven page  [migration→prod]
Week 5   │ P4 ██████████ (W4.1 → W4.2 → W4.3 → Int4)      M4: ~90, STOP
```

- **Fast-track (~2.5 wk):** run ~5 waves/week back-to-back; rebuild lanes are the bottleneck (interactive). Compress by adding more disjoint capability lanes per wave.
- **Sustainable (~4–5 wk, default):** ~3 waves/week; one integration + re-score per wave keeps quality visible.
- **Conservative (~6 wk):** ~2 waves/week with a full cross-browser + manual QA pass each integration.

**The compression lever is lane-parallelism, bounded by hot-file contention** (§4.3). You cannot run 5 capability lanes at once because they all edit `render.tsx`; you *can* run capability + UX + content + perf concurrently because those are disjoint.

---

## 8. Integration & coordination protocol

Inherited from the marathon's multi-agent protocol (0 force-pushes across ~200 commits):

1. **Branch off latest `main`** per lane: `git fetch origin && git switch -c <type>/<topic> origin/main`. Never commit to `main`.
2. **File-disjoint within a wave.** One owner per hot file per wave (§4.3). Capability lanes serialize through `render.tsx`.
3. **One migration per agent**, timestamp `date -u +%Y%m%d%H%M%S` at lane start. Park-restore on timestamp collision.
4. **Gate before every commit:** `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit && npm run lint` + touched test suites. (Plain `tsc` emits empty output on OOM crash → false "clean.")
5. **Integrator does FF-only merges** into an integration branch, runs the full gate + render-regression + new tests on the combined tree, then PR→`main`.
6. **Schema+code protocol:** if a lane includes a migration, `db:push` is part of the commit and must hit remote **before** the prod merge. `deploy:smoke` reports drift.
7. **Deploy:** PR→merge→`main` auto-deploys → re-alias custom domains (post-deploy Action, or `deploy:promote` fallback) → **`deploy:smoke`**.
8. **Never `git switch` in the shared `impronta-app` checkout** (~8 agents share it). Lanes work in isolated worktrees off a stable SHA.

---

## 9. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Hot-file contention** stalls capability parallelism | High | Med | Two capability trains; one `render.tsx` owner/wave; integrator resolves additive union edits |
| R2 | **Rebuild lanes are browser-flaky** (interactive QA) | High | Med | Seed a host in `agency_domains`; Preview+Chrome tools; deterministic `renderToStaticMarkup` fallback; 1 retry budgeted |
| R3 | **Migration drift** ships code referencing unapplied schema → prod 500 | Med | High | `db:push` before merge (mandatory); `db:check` in gate; `deploy:smoke` drift check post-deploy |
| R4 | **Scope creep** — rebuilds surface endless gaps | Med | Med | Track A triages CAN'T vs PAINFUL; only CAN'T blocks; PAINFUL is prioritized, not mandatory; §11 long-tail is "prove demand first" |
| R5 | **Font licensing** for custom-font upload | Low | Med | Ship curated Google-Fonts (OFL) first; user-upload gated + ToS-acknowledged (do not auto-fetch arbitrary foundry fonts) |
| R6 | **iframe/raw-HTML XSS / CSP** via `embed`/`code` nodes | Med | High | Sanitize + sandbox; owner-gate the `code` node; explicit CSP review lane gate in P2-L2/L3 |
| R7 | **Score inflation** misreads progress | Low | Med | Weighted overall only; per-dimension Δ never summed; fidelity numbers are screenshot-backed |
| R8 | **Supabase Free-tier quota** (egress/storage; HTTP 402) | Med | Med | Check quota first on any 402/DB error; media-library lane must watch storage growth |

---

## 10. Definition of done (the 33%)

The plan is **complete** when all are true:
1. **All 5 reference designs ≥ 85 fidelity** at 1440/768/390, screenshot-proven, committed under `fidelity/`.
2. **Weighted overall ≥ 90**, with every dimension ≥ 8.5; no dimension carried by another.
3. **Visual-regression CI is live** and gates PRs on the 5 rebuilds.
4. **A real page renders from data** via an authorable repeater (commerce grid).
5. **Capability CAN'T-list is empty** (every item shipped-with-test or deferred-with-reason).
6. **Cross-browser matrix documented**; large-tree budget enforced; no silent truncation anywhere.
7. **Undo/redo + canvas↔publish parity audits pass.**

The remaining 90→100 is explicitly **out of scope** — it is the asymptotic polish only real users surface. We declare done at "demonstrably 90" and switch to user-driven iteration.

---

## 11. Appendix — strategic detail per track

*(The "why" behind §5. Kept separate so the execution plan stays scannable.)*

### Track A — Fidelity rubric (7 axes, 0–5 each, ×20 → 0–100)
Layout accuracy · Typography · Color & surface · Spacing rhythm · Responsive behavior · Interaction & motion · Asset handling. Five designs chosen to stress different axes: editorial portfolio (type/overlap/scroll), SaaS landing (spacing/glass/sticky/dark), magazine (multi-column/dense grids), commerce (repeaters/gallery/sticky buy box), experimental brand (transforms/blend/cursor/marquee). Representative layouts, **not** pixel-copies of any one brand (no copyright reproduction).

### Track B — Capability (scan-verified 2026-05-31)
17 node kinds today (container, heading, paragraph, button, image, card, split, accordion, tabs, carousel, masonry, divider, spacer, section, …). `fontFamily` is free-string but nothing loads non-system fonts. No `video`/`embed`/`icon`/`code`. `transition*` is entrance-animation-only (`transitionProperty`: 0 hits). `containerType`: 0 hits. Single background. These are the real holes; everything else (clip-path, mask, blend, transforms, filters, scroll-snap, 27 escapes) already exists.

### Track C — Editor UX
9 direct-manip gestures + collapsible inspector (Q2) already shipped. Remaining: multi-select/group, align/distribute, keyboard + cross-page paste, undo/redo robustness, canvas↔publish parity, inspector intelligence, and (stretch) screenshot→scaffold AI assist.

### Track D — Content workflows
`dataBinding` exists on sections + containers (powers the directory/roster grid) — the foundation, not the product. Generalize to: authorable repeaters, field-level `{{binding}}`, real media library (folders/search/srcset on top of the existing assets-drawer + media-picker), global tokens authoring UI, and a light collection content-model (one migration).

### Track E — Perf & reliability
PERF-1 (renderer CSS injects per `renderBuilderNodes` call → N duplicate `<style>`; gzip-cheap but real). Large-tree budget. Visual-regression CI (the deterministic `render-output.test.ts` pattern → pixel diffs). Cross-browser. GAP-1 silent truncation at `limit(500)`.

### Track F — Test discipline
Every primitive → a `renderToStaticMarkup` regression in `render-output.test.ts`. Every bug → a failing test first (the BUG-1 pattern, PR #128). The gate never relaxes.

---

## 12. First action

1. Branch off latest `main`.
2. Launch **Wave 1.1**: P1-L1 (Fidelity Harness, Opus) + P1-L4 (PERF-1 dedup, Sonnet) — file-disjoint, run concurrently.
3. On L1 landing, launch **Wave 1.2**: P1-L2 + P1-L3 (rebuilds) + P1-L5 (visual-regression CI).
4. Integrate, record the **baseline fidelity numbers**, reconcile this doc's predicted backlog against the real one, and lock P2 scope.

That baseline is **M1** — the moment "any design" stops being an opinion.
