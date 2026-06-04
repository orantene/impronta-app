# Tulala Builder — "Best Builder on the Market 2026" Execution Plan (Jobs 1–38)

**Owner/integrator:** Claude (autonomous). **Branch:** `feat/builder-2027-fullpage`.
**Created:** 2026-06-03. **Mandate:** drive jobs **1–38** to completion in gated waves,
*without stopping to ask*. AI (#39–42) and Collaboration (#43–45) are **deferred to the
final phase** by owner decision and are NOT in this plan.

## Execution model (how I run this)
- **Gated waves.** Each wave = a small set of work-items, run as a background Workflow.
  Agents commit **serially on the shared branch** (parallel commits corrupt the shared git
  index — proven in Waves 0–4), so within a wave the work is back-to-back; *across* themes
  it's bundled into the same wave when file-disjoint.
- **Gate after every wave** = full `tsc` (0 errors) + `lint` (no new errors over the 33
  pre-existing baseline) + the targeted test suites + (for renderer/flagship-touching work)
  the render/page-designs suites. A failing gate **halts the chain** — I fix or roll back
  that wave before proceeding. Never stack broken work.
- **Chaining.** When a wave's gate passes, I auto-launch the next wave. No questions. I
  report progress as each wave lands. The whole run is on the branch; **no prod deploy**
  (that stays the separate owner-go hard stop).
- **Conflict management.** Jobs that touch the same hot file are **bundled into one agent
  task** (one owner per `selection-layer.tsx` / `style-panel.tsx` / `types.ts` slice) rather
  than split across racing agents.
- **Quality bar.** Every item: reuse existing patterns, cite the analog, gate before commit,
  and (for visible UX) leave it live-QA-able on `localhost:3010`. I do the live QA between
  waves where it matters.

## Hot files (conflict map — drives the bundling)
- `components/edit-chrome/selection-layer.tsx` — canvas direct-manipulation (Wave 4 cluster)
- `components/edit-chrome/inspectors/style-panel.tsx` + inspectors — style system (Wave 3)
- `lib/site-admin/builder-node/{types,registry,render}.tsx` — schema/render (Waves 2,3,5)
- `components/edit-chrome/freeform-layers-tree.tsx` / `navigator-panel.tsx` — layers (Wave 1)
- `components/edit-chrome/inline-editor.tsx` — inline text (Wave 3)
- data layer + a migration — collections (Wave 5)

---

## WAVE 1 — Wayfinding & Chrome  *(low-risk, high-UX, file-disjoint)*
The "find anything / read the chrome" pass. Mostly independent files.

| Item | Jobs | Agent | Effort | Files |
|---|---|---|---|---|
| **1A Layers intelligence** | #1 semantic auto-named layers · #5 bidirectional canvas↔layers highlight | **Opus** | M | freeform-layers-tree.tsx, selection-layer (highlight hook) |
| **1B Chrome clarity** | #13 always-visible selection breadcrumb · #14 toolbar icon labels/tooltips · #15 kill jargon ("PERF", "0 sections") | **Sonnet** | M | edit-chrome toolbar, navigator-panel.tsx |
| **1C Calm inspector & drawers** | #11 progressive-disclosure collapsible style groups · #12 unified drawer chrome + preload (no loading flash) | **Sonnet** | M | style-panel.tsx, drawer shells |
| **1D Onboarding & inline-add** | #20 empty-state coaching · "+ between blocks" inline canvas add affordance | **Sonnet** | S | empty-canvas-starter.tsx, canvas add UI |

**Gate 1** → commit each, then Wave 2.

## WAVE 2 — Responsive Architecture  *(foundational for true mobile flexibility)*
Schema-level; 2B depends on 2A.

| Item | Jobs | Agent | Effort | Notes |
|---|---|---|---|---|
| **2A Per-breakpoint structure** | #3 per-breakpoint visibility · #4 per-breakpoint order/reorder | **Opus** | L | BuilderNode schema (`types.ts`/`registry.ts`) + `render.tsx` + inspector. **Architecture.** |
| **2B Viewport sync + responsive preview + overrides UI** | #2 sync Style-panel viewport ↔ canvas viewport · #17 responsive preview upgrades (tablet-landscape, custom width, rotate) · #33 per-breakpoint type/spacing scale + "has overrides" indicator | **Opus** | L | **DEP: 2A.** style-panel + canvas viewport state |
| **2C Mobile-issues checker** | #34 flag tiny text / tap-targets too close / overflow | **Sonnet** | M | a pre-publish lint pass + a panel |

**Gate 2** → Wave 3.

## WAVE 3 — Style System & Tokens  *(design flexibility multiplier)*
style-panel + schema heavy → serial within the wave; 3B depends on 3A.

| Item | Jobs | Agent | Effort | Notes |
|---|---|---|---|---|
| **3A Token binding** | #10 token-reference value type (style props bind to Theme tokens) | **Opus** | L | style schema + resolver + inspector token-picker. **Architecture.** |
| **3B Linked style classes** | #22 define-once / apply-many / edit→all-update | **Opus** | L | **DEP: 3A** (reuses the value-ref concept) |
| **3C Background & gradient editor** | #24 multi-layer backgrounds + gradient picker + blend modes | **Sonnet** | M | style schema + render + inspector |
| **3D Universal states + inline-edit-all** | #26 hover/focus/active state editor for every block · #16 double-click inline edit + floating rich-text toolbar everywhere | **Sonnet** | M | inspector, inline-editor.tsx |

**Gate 3** → Wave 4.

## WAVE 4 — Canvas Direct-Manipulation  *(the hardest wave — selection-layer heavy, serial)*
All but 4C touch `selection-layer.tsx`; run strictly serial.

| Item | Jobs | Agent | Effort | Notes |
|---|---|---|---|---|
| **4A Drag craft** | #6 drop-indicator + labeled drag-ghost · #7 hover drag-handles on every block · #8 alignment/equal-spacing snap guides · #9 reparent/nesting preview | **Opus** | L | selection-layer drag path |
| **4B Selection power** | #28 multi-select + align/distribute + bulk edit · #30 right-click context menu everywhere · #32 keyboard nav + `⌘?` shortcut sheet | **Opus** | L | selection-layer selection path |
| **4C Canvas viewport tools** | #29 zoom/pan/fit-to-selection · #31 rulers + draggable guides | **Sonnet** | M | canvas frame (separable from selection-layer) |
| **4D Layout & spacing handles** | #21 visual auto-layout (canvas gap/pad handles) · #25 box-model spacing visualizer | **Opus** | L | selection-layer + layout |

**Gate 4** → Wave 5.

## WAVE 5 — Data & Dynamic Content  *(architecture; needs a migration)*
5B depends on 5A.

| Item | Jobs | Agent | Effort | Notes |
|---|---|---|---|---|
| **5A CMS collections + binding** | #36 define collections ("Team"/"Projects") + bind a repeater to them | **Opus** | XL | migration + data model + collection editor + binding UI. **Architecture.** Migration applied via the documented protocol. |
| **5B Field-mapper + conditional** | #37 visual field-mapper + live data preview · #38 conditional visibility (locale/auth/variant) | **Opus** | L | **DEP: 5A** |

**Gate 5** → Wave 6.

## WAVE 6 — Trust & Advanced  *(parallel-ish, different areas)*

| Item | Jobs | Agent | Effort | Notes |
|---|---|---|---|---|
| **6A Versioning & autosave** | #18 autosave clarity + undo-survives-reload · #19 publish diff preview + named versions | **Sonnet** | M | revisions + publish flow |
| **6B Constraints + interaction timeline** | #23 constraints/pinning · #27 interaction/animation timeline (scroll/hover/parallax + easing) | **Opus** | L | schema + render + inspector |
| **6C Mobile-first editing mode** | #35 a real mobile editing surface (not just a preview frame) | **Opus** | L | edit-chrome |

**Gate 6** → **DONE (jobs 1–38).** Live-QA sweep + a final report.

---

## Master job table (all 38)
| # | Job | Wave·Item | Agent | Effort |
|---|---|---|---|---|
| 1 | Semantic auto-named layers | 1A | Opus | M |
| 2 | Sync Style-panel viewport ↔ canvas | 2B | Opus | L |
| 3 | Per-breakpoint visibility | 2A | Opus | L |
| 4 | Per-breakpoint order/reorder | 2A | Opus | L |
| 5 | Bidirectional canvas↔layers highlight | 1A | Opus | M |
| 6 | Drop-indicator + drag-ghost | 4A | Opus | L |
| 7 | Hover drag-handles on canvas | 4A | Opus | L |
| 8 | Alignment/snap guides | 4A | Opus | L |
| 9 | Reparent/nesting preview | 4A | Opus | L |
| 10 | Token-bind style values | 3A | Opus | L |
| 11 | Progressive disclosure (style groups) | 1C | Sonnet | M |
| 12 | Unify drawer chrome + preload | 1C | Sonnet | M |
| 13 | Always-visible selection breadcrumb | 1B | Sonnet | M |
| 14 | Toolbar icon labels/tooltips | 1B | Sonnet | M |
| 15 | Kill jargon (PERF, "sections") | 1B | Sonnet | M |
| 16 | Inline edit everywhere + RT toolbar | 3D | Sonnet | M |
| 17 | Responsive preview upgrades | 2B | Opus | L |
| 18 | Autosave + undo-survives-reload | 6A | Sonnet | M |
| 19 | Publish diff + named versions | 6A | Sonnet | M |
| 20 | Empty-state coaching + inline add | 1D | Sonnet | S |
| 21 | Visual auto-layout handles | 4D | Opus | L |
| 22 | Reusable linked style classes | 3B | Opus | L |
| 23 | Constraints/pinning | 6B | Opus | L |
| 24 | Multi-layer backgrounds + gradient | 3C | Sonnet | M |
| 25 | Box-model spacing visualizer | 4D | Opus | L |
| 26 | Universal state editor | 3D | Sonnet | M |
| 27 | Interaction/animation timeline | 6B | Opus | L |
| 28 | Multi-select + align/distribute | 4B | Opus | L |
| 29 | Canvas zoom/pan/fit | 4C | Sonnet | M |
| 30 | Right-click context menu everywhere | 4B | Opus | L |
| 31 | Rulers + guides | 4C | Sonnet | M |
| 32 | Keyboard nav + shortcut sheet | 4B | Opus | L |
| 33 | Per-breakpoint everything + overrides UI | 2B | Opus | L |
| 34 | Mobile-issues checker | 2C | Sonnet | M |
| 35 | Mobile-first editing mode | 6C | Opus | L |
| 36 | CMS collections + binding | 5A | Opus | XL |
| 37 | Visual field-mapper + preview | 5B | Opus | L |
| 38 | Conditional visibility | 5B | Opus | L |

## Run schedule (critical path)
`W1 (parallel-bundled) → W2 (2A→2B; 2C parallel) → W3 (3A→3B; 3C/3D after) → W4 (serial: 4A→4B→4D; 4C parallel) → W5 (5A→5B) → W6 (parallel)`.
Architecture long-poles: **2A (per-breakpoint structure)**, **3A (token binding)**, **5A (collections)** — each gated and re-QA'd before dependents.

## Deferred — FINAL PHASE (owner decision: "keep to the end")
Not started until 1–38 are done:
- **AI:** #39 generate-section-from-prompt · #40 inline AI copy · #41 brand-match + layout hints · #42 AI alt-text/meta.
- **Collaboration:** #43 multiplayer + presence + canvas comments · #44 scheduled publish + A/B + preview links · #45 in-editor quality score + pre-publish lint.

## Progress log
- 2026-06-03: plan created; **Wave 1 launched.**
- 2026-06-03: **Wave 1 DONE + gate green** (tsc 0 · lint +0 · 41 tests). Commits: 1A `a06e37ae5` (semantic auto-named layers + per-kind icons + bidirectional canvas↔layers highlight — layers tree now reads "Hero Search / Talent Type Grid / Featured talent / Location map" etc.), 1B `de5caaa19` ("Layers" tab + toolbar labels + selection breadcrumb + de-jargoned PERF→contextual/"0 sections" suppressed), 1C `a64dc6d77` (collapsible InspectorGroups + unified DrawerSkeleton chrome), 1D `665e1d6e7` (empty-state coaching + "+ between blocks" inline canvas add). Live-QA'd: editor loads clean, semantic layers visibly transformative, flagship intact. Minor follow-up: PERF badge still surfaces a label (now contextual w/ tooltip — acceptable). **Wave 2 launched.**
- 2026-06-03: **Wave 2 DONE + gate green** (tsc 0 · lint +0 · 89 render/page-designs tests, flagship byte-identical). Commits: 2A `d1fb70540` (#3 per-bp visibility — found the existing `visibility` field already covered it, reused not duplicated; #4 per-bp CSS `order` — full emission triple + inspector control, caught+fixed a missing container-query var), 2B `cbb226975` (#2 canvas device = single viewport source-of-truth + "Editing Mobile" banner; #17 custom-width + tablet-landscape/rotate preview; #33 per-bp type/spacing + blue override-dots on layer rows), 2C `ad078b6fd` (#34 mobile-health checker: tiny-text/tap-target/overflow, 26 tests, advisory). Verified via the test suite (schema/logic wave, flagship byte-identical) — consolidated visual sweep deferred. 14/38 done. **Wave 3 launched.**
- 2026-06-03: **Wave 3 · 3B DONE (job #22 linked style classes) + gate green** (tsc 0 · lint +0 = 33 pre-existing baseline · 211 tests incl. render/render-output/page-designs flagship BYTE-IDENTICAL + 23 new style-classes). Reuses the 3A value-ref concept. Delivered:
  - **Core resolver** `lib/site-admin/builder-node/style-classes.ts` — pure, fully unit-tested: `BuilderStyleClass {id,name,style}` + `BuilderStyleClassRegistry` (page-scoped id→class map); `mergeBuilderNodeStyle(base,override)` merges the class style as BASE + node props on top across EVERY bucket (top-level scalars + responsive.tablet/mobile + containerQueries.tablet/mobile + hover; node prop wins, explicit-undefined never clobbers); `resolveNodeStyleWithClass` (identity when no classRef/unknown class/no registry → byte-identical; strips a dangling ref); helpers `stripClassRef`/`getNodeClassRef`/`countNodesLinkedToClass`/`resolveBuilderTreeClassRefs`/`styleClassIdFromName`.
  - **Schema** (back-compat, optional): `classRef?: string` on `BuilderNodeStyle` (types.ts) + `builderNodeStyleSchema` (registry.ts, min1/max48 slug). At the TOP-level style only (a class is a whole-style bundle).
  - **Render-merge** (render.tsx): `BuilderNodeRenderOptions.styleClasses` threaded → normalized (defaults `{}`); `applyStyleClass()` resolves a node's classRef at the SINGLE per-node entry (`renderBuilderNode`) before the switch, so all ~80 `node.props.style` emit sites transparently see the merged style. No classRef → identity.
  - **Inspector** (style-panel.tsx + new `linked-style-classes-bar.tsx`): page-scoped registry persisted in localStorage keyed by `pageId` (analog of the existing COPY-based `style-presets-bar.tsx` — no DB table, no migration). UI = Apply class (pick existing) · Create class from this block (snapshot current style→named class + link, block reset to pure `{classRef}`) · Update class from block (push block style into class → all linked update) · Unlink (flattens class back onto the block, look preserved) · per-class Edit-name/Delete · linked-class NAME badge on the selected block. Wired `cleanBuilderNodeStyle` to preserve `classRef` (allowlist drops unknown keys) + a `setSelectedStandaloneStyleObject` replace-primitive (keeps the draft ref in sync).
  - **DOCUMENTED FOLLOW-UP (the live-edit-UI / publish piece):** the EDITOR canvas + the PUBLISHED page are rendered SERVER-side (homepage-cms-sections.tsx body + PublishedShell.tsx shell) and do NOT yet receive the client localStorage registry, so the VISUAL class merge on those surfaces is not yet live — only the linked `classRef` + the class registry persist, and the merge is fully wired+tested in the renderer. To finish: persist the page-scoped registry INTO the page snapshot (`cms_page_revisions.snapshot` JSON next to `builderTree`, via composition-actions.ts save), surface it from the snapshot load WITHOUT auto-resolving in the EDIT path (the ~12 `resolveSnapshotBuilderTree` callers mix edit+publish, so it must be a discriminated thread, not baked into that chokepoint), and pass `styleClasses` to `renderBuilderNodes` in homepage-cms-sections + PublishedShell. `resolveBuilderTreeClassRefs` (already shipped + tested) is the one-pass flattener for the publish read. Effort: M (save/load + 2 render call sites). This split is exactly the task's sanctioned "ship apply+create+render-merge solidly; report the live-edit-UI as a follow-up."
- 2026-06-03: **Wave 3 · 3D DONE + gate green** (tsc 0 · lint +0 · 96/96 render/page-designs tests, flagship BYTE-IDENTICAL). Commit `f4a252cad`. 18/38 done.
  - **#26 Universal State Editor**: `stateStyles?: { focus?, active? }` added to `BuilderNodeStyle` (types.ts) + Zod schema (registry.ts); render.tsx emits 14 new `:focus-visible`/`:active` CSS rules + 14 presence attrs + 14 CSS vars using identical `--bn-{focus,active}-*` var pattern; `responsiveStyleVars`/`builderNodeStyleAttrs`/`hasTransitionLonghands` updated so transitions auto-fire on any state. Inspector replaces the old "Hover state" `<details>` with a 3-tab **Hover / Focus / Active** switcher (dot indicator when state has value); extracted `StateStyleFields` component renders the same 7 fields for whichever state is active; `patchSelectedStateStyle` helper; `cleanBuilderNodeStyle` preserves `stateStyles`.
  - **#16 Inline Edit Everywhere**: `resolveEditableBuilderNodeTextTarget` extended with `nav` brand text (prop `brand`) and `icon` label; `resolveBuilderNodeTextValue` retrieves the STORED prop value (with rich marker syntax — bold/italic/links) rather than raw DOM `textContent`, so double-click now feeds the inline `RichEditor` its real marker-format string and the floating **B/I/Accent/Color/Link toolbar** activates correctly on selection. `ActiveTextEdit.builderNode.propKey` widened to include `"brand"`. The floating toolbar was already functional via `CanvasEditOverlay → RichEditor → ToolbarPlugin`; the stored-value change makes it actually useful across all text kinds.
