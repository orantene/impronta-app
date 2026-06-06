# Context-Split Risk Map — `edit-context.tsx`

**Area key:** `context-split-risk-map`
**Worktree:** `/Users/oranpersonal/Desktop/impronta-builder-marathon` (HEAD `fa830022d`, #269, ahead of the audit snapshot)
**Target file:** `web/src/components/edit-chrome/edit-context.tsx` (6,437 lines)
**Mission tie-in:** This is "Sub-step E" — the unresolved item that taxes the W3 client-canvas wins with whole-editor re-renders. This doc is the de-risking map, NOT a directive to split the context. The goal is **"no whole-editor re-renders,"** and the cheapest path there may not be a structural split.

---

## 1. The actual problem (proven, not asserted)

`EditProvider` assembles ONE `value` object in a single `useMemo` (`edit-context.tsx:6032-6421`) with a **~120-entry dependency array**. The interface `EditContextValue` (`edit-context.tsx:249-1024`) has **122 fields**. Every consumer reads via `useContext(EditContext)` (`useEditContext`, line 6426).

React context propagation is **all-or-nothing**: when the provider `value` identity changes, every component that called `useContext` re-renders. Because the value memo depends on hot-path state, it recreates constantly:

- `hoveredSectionId` and `hoveredBuilderNodeId` are both in the deps array (`edit-context.tsx:6280-6281`).
- `setHoveredBuilderNodeId(row.id)` fires on **every layer-row mouseenter** (`freeform-layers-tree.tsx:550`) and every canvas-block hover (`selection-layer.tsx:586`).
- `setHoveredSectionId(...)` fires on every navigator-row and canvas-section hover (`navigator-panel.tsx:2331`, `selection-layer.tsx:584`).
- `selectedSectionId`, `dirty`, `saving`, `device`, every drawer-open boolean are all in the same deps array.

So: **moving the mouse across the layers panel recreates the entire context value on every row, re-rendering all 38 consumers.** Selecting a node, typing in an inspector field (via `dirty`/`saving` flips), or toggling any drawer does the same.

**Aggravating factor — ZERO consumers use `React.memo`.** Grep for `React.memo`/`memo(` across `edit-chrome/*.tsx` + `inspectors/*.tsx` returns nothing. There is no second line of defense; a value-identity change re-renders every subtree unconditionally.

**React Compiler is NOT enabled.** `web/next.config.ts` has no `reactCompiler` flag (only `viewTransition` + `serverActions` under `experimental`, lines 216-225). The "kept a string to dodge a React-Compiler object-param memo bail" comments throughout the interface (e.g. lines 360, 579, 627) are **forward-compat / aspirational** — the compiler is not in the build today, so it is not saving us. (If it were enabled, it would auto-memoize consumers and blunt some of this — worth a separate spike, but out of scope here.)

---

## 2. The de-risking template ALREADY EXISTS in the codebase

W3 already shipped the exact pattern Sub-step E needs: a **process-singleton external store + `useSyncExternalStore`**, flag-gated, byte-identical when off.

- `client-builder-canvas-bridge.ts` — a module-level store (`currentTree` + `listeners` Set) with `publishBuilderCanvasTree` / `subscribeBuilderCanvasTree` / `getBuilderCanvasTreeSnapshot`. Its own header comment calls it *"a deliberately tiny slice of the Sub-step E selector store — scoped to exactly the one value the client canvas needs."*
- `EditProvider` PUBLISHES into it from an effect (`edit-context.tsx:2157-2163`), flag-gated behind `isBuilderClientCanvasEnabled()`.
- `client-builder-canvas.tsx` SUBSCRIBES via `useSyncExternalStore(subscribe, getSnapshot)` (`client-builder-canvas.tsx:94-96`).

This is the proven, in-tree, reviewed precedent. The extraction sequence below **generalizes this exact mechanism** rather than inventing a new architecture. That dramatically lowers the risk: we are not introducing `useSyncExternalStore` to the codebase — it already ships in prod behind `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` (now ON).

**Test harness exists but is unused for components.** `web/package.json` already has `@testing-library/react ^16.3.2`, `@testing-library/dom`, `@testing-library/jest-dom`, `jsdom`, and `vitest ^4.1.7`, plus a `test:components` script. BUT no `.test.tsx` renders `EditProvider` or asserts on `useEditContext` — grep for `@testing-library/react` / `render(` in `*.test.tsx` returns nothing. The engine has 30+ unit tests (`web/src/lib/site-admin/builder-node/*.test.ts`); the **provider has none**. Seatbelt-before-surgery means writing the first provider-render tests, but **no new dependencies are needed.**

---

## 3. Consumer inventory — 38 files, classified by slice

`useEditContext`/`useMaybeEditContext` callers (excludes the definition file). Slices: **SEL**=selection (section + builder-node ids, multi-select, hover), **TREE**=composition tree + structure mutations (builderTree, slots, insert/move/remove/duplicate, components/instances), **DRAFT**=inspector working copy (loadedSection, draftProps, dirty, saving, recordFieldEdit), **HIST**=undo/redo, **PERSIST**=save/publish/refresh/CAS (saveDraft, flushBuilderTreeSave, refreshComposition, queueRouterRefresh, pageVersion, getCompositionCasVersion), **UI**=drawer/overlay/panel open flags + workspace-layout, **DEVICE**=device/previewFrame/mobileEditMode, **STATIC**=identity that never changes after mount (tenantId, locale, plan, canEditSiteShell, pageId/pageSlug).

| # | Consumer file | `useEditContext` call sites | Slices it reads | Re-renders on hover today? | Notes |
|---|---|---|---|---|---|
| 1 | `edit-shell.tsx` | **8** (split sub-components) | ALL (orchestrator) + tiny leaf reads | Yes (all 8) | Lines 255 `{pageId}`, 1175 `{selectedSectionId,hoveredSectionId}`, 1305 `{lastDraftSavedAt,clearDraftSavedToast}`, 1354 `{mutationError,clearMutationError}`, 1543 `{setDevice,setPreviewFrameWidth}`. **Already decomposed into leaf consumers — but each leaf still re-renders on every hover.** |
| 2 | `selection-layer.tsx` | 2 | SEL + TREE + DRAFT(loadedSection) + PERSIST(pageVersion) + DEVICE(device) + UI(navigator*,previewing) | **Yes — hottest** | ~55 fields (lines 557-621). On the hover hot-path itself (sets+reads hover). |
| 3 | `navigator-panel.tsx` | 2 | SEL + TREE + UI(navigator*,recentAdditions) + PERSIST(pageVersion) + STATIC | **Yes — hottest** | ~44 fields (lines 232-275). Owns layers/outline/classes. Hover source. |
| 4 | `freeform-layers-tree.tsx` | 3 | SEL(hover) + TREE | **Yes — hottest** | Sets `hoveredBuilderNodeId` per row (line 550). |
| 5 | `inspector-dock.tsx` | 2 | SEL + DRAFT + TREE + PERSIST(queueRouterRefresh) + STATIC | Yes | Lines 263-286. The right-rail editor host. |
| 6 | `inline-editor.tsx` | 2 | SEL(selectedSectionId,selectBuilderNode) + TREE(builderTree,patchBuilderNodeProps) + DRAFT(draftProps,setDraftProps,setDirty) | Yes | Lines 84-94. In-canvas text edit. |
| 7 | `inspectors/style-panel.tsx` | 2 | DRAFT + TREE(patchSelectedBuilderNodesStyle) + DEVICE | Yes | Lines 1979-1994. Dual-style-engine surface. |
| 8 | `inspectors/layout-panel.tsx` | 2 | DRAFT + TREE(patchBuilderNodeProps) | Yes | Lines 1697-1704. |
| 9 | `inspectors/responsive-panel.tsx` | 3 | DEVICE + DRAFT | Yes | |
| 10 | `inspectors/data-panel.tsx` | 2 | STATIC(workspacePlan) + TREE | Yes | Line 116 reads only `{workspacePlan}` (STATIC!) at top — strong selector candidate. |
| 11 | `inspectors/data-panel-conditional.tsx` | 2 | TREE + DRAFT | Yes | |
| 12 | `inspectors/instance-overrides-panel.tsx` | 2 | TREE(setInstanceOverride,variants) + SEL | Yes | |
| 13 | `inspectors/component-library-panel.tsx` | 2 | TREE(insertBuilderComponent,linked) | Yes | |
| 14 | `inspectors/my-blocks-panel.tsx` | 2 | TREE(presets,paste) | Yes | |
| 15 | `inspectors/builder-node-content.tsx` | 2 | DRAFT + TREE | Yes | |
| 16 | `inspectors/content-dispatch.tsx` | 2 | DRAFT + TREE | Yes | |
| 17 | `inspectors/site-header/SiteHeaderInspector.tsx` | 2 | STATIC(canEditSiteShell) + PERSIST | Yes | |
| 18 | `inspectors/site-header/tabs/BrandTab.tsx` | 2 | STATIC + PERSIST | Yes | |
| 19 | `inspectors/site-header/tabs/StyleTab.tsx` | 2 | STATIC + PERSIST | Yes | |
| 20 | `topbar.tsx` | several | UI(workspace-layout,drawer opens) + PERSIST + DEVICE + STATIC | Yes | Line 2393 reads only `{hasSavedWorkspaceLayout,pinWorkspaceLayout,resetWorkspaceLayout}` (UI). |
| 21 | `command-palette.tsx` | 1 (`const ctx`) | reads MANY action fns | Yes (when mounted) | Lazy-mounted only when open, so re-render cost is gated by visibility. |
| 22 | `shortcut-overlay.tsx` | 2 | **STATIC only** `{canEditSiteShell,pageSlug}` | Yes (waste) | Pure static read — should NEVER re-render after mount. |
| 23 | `theme-drawer.tsx` | 2 | **UI only** `{themeOpen,closeTheme,queueRouterRefresh}` | Yes (waste) | Cleanest selector candidate. |
| 24 | `assets-drawer.tsx` | 2 | **UI only** `{assetsOpen,closeAssets,tenantId}` | Yes (waste) | |
| 25 | `collections-drawer.tsx` | 2 | **UI only** `{collectionsOpen,closeCollections}` | Yes (waste) | |
| 26 | `publish-drawer.tsx` | 2 | UI(publishOpen) + PERSIST + TREE(slots,builderTree) + DRAFT(dirty,saving) | Yes | Lines: `publishOpen,closePublish,…,saveDraft,flushBuilderTreeSave,builderTree`. |
| 27 | `revisions-drawer.tsx` | 2 | UI(revisionsOpen) + PERSIST(restoreRevision,pageVersion) + STATIC | Yes | |
| 28 | `page-settings-drawer.tsx` | 2 | UI(pageSettingsOpen) + PERSIST(savePageMetadata) + DRAFT(saving) + STATIC | Yes | |
| 29 | `schedule-drawer.tsx` | 2 | UI(scheduleOpen) + PERSIST | Yes | |
| 30 | `comments-drawer.tsx` | 2 | UI(commentsOpen,focusSectionId) + STATIC(locale) | Yes | |
| 31 | `section-picker-popover.tsx` | 2 | UI(pickerPopover) + TREE(insertSection,slots,slotDefs,library) | Yes | |
| 32 | `starter-template-gallery-overlay.tsx` | 2 | UI(galleryOpen) + TREE(slots,library) + PERSIST(refresh) | Yes | |
| 33 | `composition-library.tsx` | 2 | UI(libraryTarget) + TREE(insertSection) | Yes | |
| 34 | `command-palette.tsx` (dup of 21) | — | — | — | (counted once) |
| 35 | `iframe-bridge.tsx` | 3 | DEVICE + SEL + TREE | Yes | Responsive-preview iframe host. |
| 36 | `iframe-child.tsx` | 3 | DEVICE + SEL | Yes | |
| 37 | `WorkspaceTemplateGallery.tsx` | 2 | TREE + PERSIST | Yes | |
| 38 | `MobileHealthPanel.tsx` | 1 | DEVICE(mobileEditMode) + TREE | Yes | |
| 39 | `mobile-edit-panel.tsx` | (imports context types) | DEVICE + TREE | Yes | |
| — | `client-builder-canvas-bridge.ts` | (type-only import) | n/a | n/a | The bridge itself; not a context consumer. |

**Slice-demand summary** (how many consumers touch each slice):

- **UI (drawer/overlay/panel flags):** ~17 consumers. **The largest, cleanest cut.** Many read ONLY a UI boolean + one close fn (#22-25). These suffer 100% wasted re-renders today.
- **TREE (composition + mutations):** ~20 consumers. The biggest payload but the action fns are already `useCallback`-stable; only `builderTree`/`slots`/`slotDefs`/`library` *data* churns, and only on real mutations (not hover).
- **SEL (selection + hover):** ~10 consumers, but it is the **hot-path driver** (hover fires constantly).
- **DRAFT:** ~10 consumers (inspectors). Churns on every keystroke via `draftProps`/`dirty`/`saving`.
- **PERSIST:** ~12 consumers. Mostly stable fns + occasional `pageVersion`/`lastDraftSavedAt`.
- **DEVICE:** ~7 consumers.
- **STATIC:** read by ~15 consumers; **never changes after mount** yet recreates with the value object every hover.

---

## 4. The cheap win FIRST (try before any split) — reframe-honoring

**Do NOT split the context as step 1.** The reframe is explicit: "no whole-editor re-renders," and the cheapest route is to stop the value object from churning on the hottest path. Two surgical, low-risk moves, in order:

### Win A — Move hover OUT of the context value (highest ROI, ~S effort)
`hoveredSectionId` / `hoveredBuilderNodeId` are the #1 churn source (fire on every mouse move across canvas + layers). They are read by only ~3-4 consumers (selection-layer, navigator-panel, freeform-layers-tree, and the in-canvas hover ring). **Extract hover into a dedicated `useSyncExternalStore` bridge** — a clone of `client-builder-canvas-bridge.ts` holding `{hoveredSectionId, hoveredBuilderNodeId}`. Publish from EditProvider's existing setters; subscribe in the ~4 consumers that need it. Removing these two from the value-memo deps (lines 6280-6281, plus the setters) means **hovering no longer recreates the context value at all.** This alone should reclaim the majority of the wasted renders without touching the provider's structure. Flag-gate it exactly like the canvas bridge.

### Win B — `React.memo` the leaf consumers (S effort, mechanical)
Zero consumers are memoized today. Wrapping the cheap leaf reads (#22 shortcut-overlay, #23-25 drawers, the `edit-shell` toast/save-chip leaves at lines 1305/1354) in `React.memo` is a near-zero-risk mechanical change that caps their re-renders once their *props* are stable. (Memo alone won't help while the *context value* they consume churns — so this is complementary to Win A, not a substitute. After Win A removes hover churn, memo stops the residual re-renders from `dirty`/`saving`/drawer-toggle.)

**Profile gate:** Before AND after each win, capture a React Profiler flamegraph of (a) dragging the mouse across the layers panel, (b) selecting a node, (c) typing in a style field. The audit flags "instant paint UNPROFILED" — this is where to close it. If Win A + Win B get the hover/select flamegraph flat, **the structural split may not be needed at all**, and we stop here (lowest possible risk).

---

## 5. IF a structural split is still warranted — incremental sequence by blast radius

Only proceed past §4 if profiling shows the *single value object itself* (not just hover) is still the bottleneck — e.g. typing churn (`draftProps`/`dirty`/`saving`) or drawer toggles still re-render the heavy TREE consumers. Split via **additive sibling contexts/stores**, never a big-bang rewrite. Each step is independently shippable and flag-gated.

Two viable mechanisms, both already in-tree:
- **(M1) `useSyncExternalStore` selector stores** — the canvas-bridge pattern. Best for high-frequency, narrow slices (hover, selection). Subscribers pick exactly their keys; no provider re-render at all.
- **(M2) Nested React contexts** — split the one `EditContext` into several providers (`EditUiContext`, `EditSelectionContext`, `EditTreeContext`, …) stacked in `EditProvider`. Each gets its own `useMemo`. Cheaper to author than a store (keeps `useContext` ergonomics) but still re-renders all of *that context's* consumers on *that slice's* change. Good for the UI-flags slice where consumers are already tiny.

### Extraction order (lowest blast radius → highest):

**Step 1 — UI / drawer-flags slice (LOWEST RISK, do first).**
- *Why first:* ~17 consumers, but the drawer/overlay ones (#22-33) read a **single boolean + a close fn** and have **no overlap with TREE/DRAFT/SEL** mutation logic. Pulling drawer opens into an `EditUiContext` (M2) or a `useEditUi()` selector (M1) is mechanically isolated.
- *Blast radius:* contained to the drawer components + `topbar` (which fires the opens) + `edit-shell` (which mounts them). No engine code, no mutation code, no save path touched.
- *Regression surface:* drawer open/close, drawer mutex (only one right-rail drawer at a time — `dismissCompetingEditorChrome`, lines 6202-6203), `⌘K`/`?` overlays, `⌘\` navigator toggle. All testable via provider-render tests (fire `openTheme()`, assert `themeOpen` flips + others stay closed).
- *Effort:* M. *Risk:* low.

**Step 2 — STATIC slice (TRIVIAL, can run parallel to Step 1).**
- *Why:* `tenantId, locale, defaultLocale, workspacePlan, canEditSiteShell, advancedElementLibraryEnabled, canInsertRawHtmlElements, pageId, pageSlug, tenantSiteLabel, workspaceMembershipSlug` never change after mount. Put them in their own `EditStaticContext` whose value memo has an **empty/stable dep set** → it never recreates. Consumers #22, #17-19, half of #10/#20/#27-30 stop re-rendering for static reads entirely.
- *Blast radius:* read-only; no setters, no mutations. The safest possible cut.
- *Effort:* S. *Risk:* low. (Can be folded into Step 1's PR.)

**Step 3 — SELECTION slice (M1 store).**
- *Why third:* selection is hot (drives the inspector + selection ring) and read by ~10 consumers, but the selection STATE (`selectedSectionId`, `selectedBuilderNodeId`, multi-select sets) is conceptually self-contained. Hover (§4 Win A) should already be its own store by now; selection is the natural next slice into the same store mechanism.
- *Blast radius:* selection-layer, navigator-panel, inspector-dock, inline-editor, iframe-child, the inspectors that read `selectedSectionId`. Higher because selection feeds the inspector load (`inspector-dock` reads selection → loads `loadedSection`).
- *Regression surface:* click-to-select, shift/cmd multi-select (`extendSelection`/`toggleSelection`, lines 316-318 + builder-node equivalents 334-337), `focusSectionForEdit`, the selection↔canvas↔layers highlight sync, and the **inspector re-load on selection change** (the trickiest coupling — selection change must still trigger `setLoadedSection`). Needs the provider-render seatbelt to be solid first.
- *Effort:* L. *Risk:* medium.

**Step 4 — DRAFT slice (inspector working copy).**
- *Why:* `draftProps`/`dirty`/`saving`/`loadedSection`/`recordFieldEdit` churn on every keystroke and gate undo. Isolating them stops typing from re-rendering TREE/UI consumers.
- *Blast radius:* the inspectors (#5-19) + `inline-editor`. Tightly coupled to PERSIST (autosave) and HIST (recordFieldEdit→undo). This is where the **dual-style-engine** seam lives (style-panel) — touch with care.
- *Effort:* L. *Risk:* medium-high (autosave + undo coupling).

**Step 5 — TREE + PERSIST + HIST (the core engine slice — DO LAST / maybe NEVER split).**
- *Why last:* this is the heart — `builderTree`, `slots`, every insert/move/remove/duplicate/component/instance mutation, the CAS save path, undo/redo. ~20 consumers. The action fns are **already `useCallback`-stable**, so they don't *cause* churn; only `builderTree`/`slots` *data* changes, and only on real mutations (which legitimately need re-renders). Splitting this is high-effort, high-risk, and **may have near-zero benefit** once §4 + Steps 1-4 remove the hot-path churn.
- *Recommendation:* **Profile after Step 4. If the mutation-path re-renders are already acceptable (they only fire on real edits, not hover/typing), STOP — do not split the core.** The riskiest surgery should only happen if the flamegraph proves it pays.
- *Effort:* XL. *Risk:* high. *Likely verdict:* don't.

---

## 6. Regression surface estimate (the whole refactor)

| Coupling that makes this risky | Where | Mitigation |
|---|---|---|
| **No provider-level tests exist** | only engine `*.test.ts` | **Seatbelt first:** write `edit-context.test.tsx` rendering `EditProvider` + asserting (a) selecting flips `selectedSectionId` + clears multi-set, (b) drawer mutex, (c) undo/redo stack depth, (d) hover does NOT recreate value (render-count probe). RTL+jsdom already installed. |
| **Selection → inspector load** | `inspector-dock` loads `loadedSection` when `selectedSectionId` changes | Keep the load effect co-located with whichever store/context owns selection; assert the round-trip in a test. |
| **Autosave + undo coupling** | DRAFT writes feed `recordFieldEdit`→`past[]`; `saveDraft`/`flushBuilderTreeSave` debounce | Don't split DRAFT from HIST/PERSIST in the same step; move them together or keep in core. |
| **Drawer mutex** | `dismissCompetingEditorChrome` closes competing chrome on any right-rail open | Single owner for all UI flags (Step 1) so the mutex stays atomic. |
| **Cross-subtree bridge already in play** | EditProvider is a SIBLING of the page body; canvas reads via `useSyncExternalStore` | Any new selector store must publish from the SAME provider effect site; mirror the canvas-bridge flag-gate so OFF = byte-identical. |
| **Flag discipline** | `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` precedent | Gate each extraction behind its own `NEXT_PUBLIC_*` flag; ship OFF, profile, flip ON, keep the legacy single-context path until a flag bakes. |
| **`useFormStatus`/lazy-mount surfaces** | `command-palette` lazy-mounts; `topbar` uses `useFormStatus` | These already gate their own render cost; lower priority, validate they still mount/unmount cleanly. |

**Overall:** the structural split is genuinely the riskiest refactor in the builder (122-field surface, 38 consumers, autosave/undo/CAS coupling, no provider tests). BUT the codebase de-risks it three ways: (1) the `useSyncExternalStore` bridge pattern is already shipped and flag-gated; (2) action fns are already `useCallback`-memoized; (3) the test harness is installed and unused, so the seatbelt is dependency-free to build. **The honest recommendation is to NOT lead with the split** — do §4 Win A (hover store) + Win B (memo) + profile, and only descend into §5 Steps 1-2 (UI + STATIC, both low-risk) if the profiler still shows value-object churn. Steps 3-5 should each be re-justified by a fresh flamegraph; Step 5 (core) likely should never happen.
