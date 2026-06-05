# Page Builder → 100% — Phased Execution Plan (2026-06-04)

Mandate: take **every dimension to 100%** — Fast 34→100 · Easy-to-design 84→100 · Clean 78→100 · Lean → first-class. Source audit: `builder-premium-audit-2026-06-04.md`.

## What "100%" means (acceptance per dimension)
- **Fast = 100:** editing feels native — selection/edit/undo < ~16ms, no per-edit server round-trip, drag is 60fps on a 300-node page, no stale-canvas. Measured by profiling real gestures on localhost + a prod build.
- **Easy-to-design = 100:** every common design intent achievable with a *visual* control (no raw-CSS strings), one uniform style engine for sections + freeform, forms, custom breakpoints, crop, motion. Webflow/Framer parity.
- **Clean = 100:** every control does something, one name per concept, the flagship features (palette/shortcuts) are discoverable, panels feel like a workspace not an admin.
- **Lean = first-class:** editor TTI small; drawers/inspectors code-split; no dead JS.

## Assignment philosophy
- **opus** → architecture, risky/cross-cutting refactors, perf-critical hot paths, UX-judgment work, final QA/verification. **sonnet** → well-scoped, low-ambiguity, small-blast-radius mechanical changes. **haiku** → not used (quality bar too high).
- **Effort:** S ≤½d/1 file · M ~1d/few files · L ~2-3d/subsystem · XL ~1wk/architectural.
- **agentType:** `general-purpose` for implementation; `Explore` for pre-task code-mapping on the big refactors; a `code-review`-style adversarial pass closes each risky wave.

## Wave DAG (dependency + parallelism)
```
W0 Trust ──┐
           ├─► W1 Cockpit ──┐
W2 PerfA ──┴──────────────► W3 PerfB (leap) ─► W4 Lean
                                              └► W5 Features ─► W6 QA→100
```
W0/W2 are independent and run first. W3 (client-render) is the linchpin; W2 precedes it (clean rect base). W4+W5 ride on W3's fast feedback. W6 gates the 100%.

## Wave 0 — Trust & dead controls  · **LAUNCHED (workflow `builder-100-wave1`)** · Clean+Bugs
| ID | Task | Files | Model | Effort | Parallel |
|--|--|--|--|--|--|
| 0.1 | ✅ Remove dead Navigator-rail pencil + Saved | navigator-panel | opus | S | done |
| 0.2 | Block-toolbar Edit pencil: hide on non-text blocks | selection-layer | **opus** | M | ✔ |
| 0.3 | Cmd-K palette launcher + ? overlay; hide Discard-draft stub | topbar | **opus** | M | ✔ |
| 0.4 | Kill "+ Add secondary" silent data-loss | cta-duo-editor + 2 callers | sonnet | S | ✔ |
| 0.5 | Error guards (.catch/try-catch) | revisions-diff, comments-drawer, BrandKitImport | sonnet | S | ✔ |
| 0.6 | Unify panel name → "Layers" | navigator-panel, inspector-dock, empty-canvas-starter | sonnet | M | ✔ |
*Gate: integrator (me) runs tsc+lint, live-verifies on :3010, commits.*

## Wave 1 — Cockpit coherence · Clean 78→92
| ID | Task | Model | Effort |
|--|--|--|--|
| 1.1 | Block toolbar: demote secondary actions (reset/copy/move) to context menu, divider before destructive, ~4 primary | opus | M |
| 1.2 | Inline-edit: hover affordance/tooltip on editable text; recover duplicate-match on-canvas (don't punt to inspector) | opus | M |
| 1.3 | Drawer co-residence: right-rail drawers may coexist with inspector | opus | L |
| 1.4 | Topbar declutter: overflow "•••" for secondary tools | sonnet | M |
| 1.5 | Save-signal consolidation: one save chip + one "N unpublished → Publish" | sonnet | M |
| 1.6 | Mobile: replace amber wall with a designed compact mode | opus | M |
| 1.7 | Inspector width drag-resize; show active tab label | sonnet | S |
| 1.8 | Populated-page onboarding coachmarks (3-4 core gestures) | sonnet | M |
*Mostly parallel (distinct surfaces). Depends on 0.3 (palette exists).*

## Wave 2 — Perf Phase A (contained) · Fast 34→~58
| ID | Task | Model | Effort |
|--|--|--|--|
| 2.1 | Cache drag-candidate rect index once at drag-start (snapshot rects + Map<id,node>); depth from tree, not contains(); reuse across gesture | opus | L |
| 2.2 | Same cached index for marquee + selection rect scans; rAF-throttle marquee state | opus | M |
| 2.3 | Debounce localStorage history persist off the commit hot path | sonnet | S |
| 2.4 | Debounce/coalesce granular saves; stop blocking UI | opus | M |
| 2.5 | Memoize id-maps + reconcileBuilderTreeFromSlots on a revision counter (not tree ref) | opus | M |
| 2.6 | Move hover state out of the global context (local to overlay) | opus | M |
*Sequential within selection-layer/edit-context (central). Adversarial verify drag/marquee correctness on :3010.*

## Wave 3 — Perf Phase B (the leap) · Fast →90+
| ID | Task | Model | Effort |
|--|--|--|--|
| 3.0 | Map the render+refresh data flow (Explore pre-pass) | opus/Explore | M |
| 3.1 | Client-render canvas from in-memory builderTree (client port of renderBuilderNode) | **opus** | **XL** |
| 3.2 | React.memo each node by immutable identity; memoize style attrs | opus | L |
| 3.3 | Replace router.refresh-per-edit with rare reconcile (conflict/publish only) | opus | L |
| 3.4 | Split context: stable-dispatch provider + volatile external store (useSyncExternalStore + selectors) | **opus** | **XL** |
| 3.5 | Undo as inverse patches (drop whole-tree stringify+clone) | opus | L |
| 3.6 | Adversarial verify: no stale canvas, correctness parity vs server render, profile gains | opus×3 | M |
*Strictly sequential, human-in-loop, verified on localhost + prod build. Highest risk. The linchpin for Fast→100.*

## Wave 4 — Lean (bundle/TTI)
| ID | Task | Model | Effort |
|--|--|--|--|
| 4.1 | next/dynamic the drawers (assets/comments/theme/revisions/templates/schedule) + palette + template gallery | sonnet | M |
| 4.2 | Code-split inspectors by tab | opus | M |
*Parallel. Depends on 0.3 + W3.*

## Wave 5 — Design-ease features · Easy 84→100
| ID | Task | Model | Effort |
|--|--|--|--|
| 5.1 | Form node + inputs (input/textarea/select/checkbox/submit + validation) | **opus** | L |
| 5.2 | Custom/added breakpoints (beyond fixed tablet/mobile) | opus | L |
| 5.3 | Unify section "presentation" editing onto the freeform style engine | **opus** | **XL** |
| 5.4 | Visual pickers: grid-track editor, filter sliders, focal-point drag, clip-path | opus | L |
| 5.5 | Color picker: eyedropper + recent/saved swatches + palette-from-image | sonnet | M |
| 5.6 | Media: crop UI + video assets | opus | M |
| 5.7 | Motion/interaction timeline (scroll/click/loop) | opus | L |
| 5.8 | Class manager surface + project find/replace | sonnet | M |
| 5.9 | More starter templates + section presets | sonnet | S |
*Parallel by feature (disjoint node-types/inspectors); 5.4/5.6 ride W3's fast feedback; 5.3 lands before dependent section work.*

## Wave 6 — Polish + QA → 100
| ID | Task | Model | Effort |
|--|--|--|--|
| 6.1 | Final micro-polish sweep (transitions, focus rings, copy) | sonnet | M |
| 6.2 | Full regression QA per surface (adversarial multi-agent) on localhost + prod build | opus×N | L |
| 6.3 | Perf re-profile (confirm Fast→90+), fidelity re-score, a11y sweep | opus | M |
*Gates the 100% claim. Every prior wave verified before this scores it.*

## Orchestration & verification
- Parallel waves (0/1/4/5) run as agent fan-outs grouped by **disjoint files** (or worktree isolation when mutating shared files). Sequential waves (2/3) are driven step-by-step with a profiling/verify gate between steps.
- **Every wave:** integrator runs `tsc --noEmit` + lint, live-verifies the changed surface on :3010, commits a labelled batch, then an adversarial review agent tries to break it before moving on.
- **Ship cadence:** each wave is a PR off `main`; the risky W3 ships behind a runtime flag first, prod-smoke-verified, then default-on.
