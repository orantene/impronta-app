# Marathon findings — Perf / re-render hotspots

Area key: `perf-rerender-hotspots`
Worktree: `/Users/oranpersonal/Desktop/impronta-builder-marathon`
Date: 2026-06-05
Scope: `edit-context.tsx` (the provider), `render.tsx` (canvas node renderer), `client-builder-canvas.tsx` (W3 client canvas).

---

## TL;DR verdict

**The full provider split ("Sub-step E") is NOT required to hit instant paint.** Two cheap, surgical wins remove the dominant re-render tax:

1. **Stabilize the `renderBuilderNodes` options object on the client canvas** (currently a fresh object every render → defeats the per-node `memo` → every node repaints on every publish). ~5-line fix. This is the literal "instant paint" defeater on the W3 path.
2. **Move the 4 high-churn UI signals — `hoveredSectionId`, `hoveredBuilderNodeId`, `selectedSectionId`/selection, and `dirty` — out of the monolithic `value` object** so a hover/selection/commit no longer rebuilds the context value and re-renders all 41 consumers. Either (a) split them into 1-2 *secondary* small contexts, or (b) publish them through a `useSyncExternalStore` micro-store like the existing `client-builder-canvas-bridge`.

A FULL context decomposition (40+ fields into N providers + selector store) is a large, risky refactor that buys little *additional* paint latency once (1) and (2) land. Recommend it only as an optional later polish, gated behind a render-count regression test. **Profile (1)+(2) first; do not split the whole context preemptively.**

---

## How the editor is wired (ground truth)

- `EditProvider` builds ONE giant context value via `useMemo` at **edit-context.tsx:6032-6421**, returned at **6423**: `<EditContext.Provider value={value}>`.
- The value object has ~180 fields; the `useMemo` dependency array (**6239-6420**) lists ~150 deps including the high-churn primitives `builderTree`, `selectedSectionId`, `hoveredSectionId`, `hoveredBuilderNodeId`, `dirty`, `saving`, `past.length`, `future.length`, `draftPropsState`, plus every drawer-open boolean.
- **41 components** consume it via plain `useContext` (`useEditContext` at **6426**, `useMaybeEditContext` at **6435**). Full list verified by grep — every one destructures fields off the single value; e.g. `iframe-child.tsx:122` reads only `{ previewing }`, `inspectors/data-panel.tsx:116` reads only `{ workspacePlan }`.
- **There is NO context-selector layer anywhere** (`useContextSelector` / external selector store): grep returns none. React context has no selector semantics — when the provider value identity changes, **every** consumer re-renders regardless of which field it reads. Destructuring does not shield a consumer.

### What mutates on a typical freeform edit

A single text/style/move commit runs `commitBuilderTreeMutation` (**edit-context.tsx:4141-4199**):
```
setBuilderTree(nextTree)   // builderTree dep changes
setPast(...)               // past.length dep changes
setFuture([])              // future.length dep changes
setDirty(true)             // dirty dep changes
```
→ 4 deps change → `value` useMemo recomputes → **new object identity** → **all 41 consumers re-render**.

A bare **hover** across an element boundary runs `setHoveredBuilderNodeId` (**selection-layer.tsx:1018-1019**, guarded by `if (nodeId !== hoveredBuilderNodeId)` so it's per-boundary not per-pixel) → `hoveredBuilderNodeId` dep changes → **value rebuilds → all 41 consumers re-render**, just because the mouse moved from one block to the next. Same for `selectedSectionId` / selection on every click.

Every drawer toggle (`publishOpen`, `themeOpen`, `assetsOpen`, …) is also a `value` dep → opening Theme re-renders the topbar, inspector, selection layer, inline editor, etc.

### What is ALREADY done well (do not "fix")

- **Per-node canvas memo** — `BuilderNodeView` is `memo`'d with a comparator `Object.is(prev.node) && Object.is(prev.options)` (**render.tsx:3182-3194**). With immutable tree updates, only the edited node's subtree gets a new reference, so an edit repaints exactly that subtree *provided options is stable* (see bug #1 below).
- **Drag/scroll overlays are rAF-isolated** — the selection ring, chip, move/resize/spacing/gap handles are positioned by writing `element.style` directly from a standalone rAF loop, NOT React state (**selection-layer.tsx:657-671**). So dragging/scrolling does NOT thrash the context. The marquee gesture is likewise rAF-coalesced (**649-653**).
- **Typing is local** — text edits live in the RichEditor contentEditable buffer; the context write (`setDraftProps`) happens on **commit/blur** (`commitText`, **inline-editor.tsx:133-157**), not per-keystroke. So the tax is per-COMMIT, per-selection, per-hover-boundary, per-drawer — *not* per-keystroke.
- **Saves are debounced/coalesced** — optimistic local tree applied immediately; server persist coalesced 750ms (**4120-4192**). Network is off the keystroke path.

The net: the W3 canvas repaint is surgical, BUT it is currently sabotaged by an unstable options object (bug #1), and every *other* consumer re-renders far more than it needs to (bug #2).

---

## CHEAP WINS (in priority order — do these before any structural split)

### CW-1 (critical, ~5 lines) — Stabilize the client-canvas `renderBuilderNodes` options
**File:** `client-builder-canvas.tsx:101-113`.
`ClientBuilderCanvas` calls `renderBuilderNodes(tree, { …inline object… })`. `renderBuilderNodes` then builds a **fresh** `normalizedOptions` object every call (**render.tsx:3200-3212**) and passes it to every `<BuilderNodeView>`. The memo comparator checks `Object.is(prev.options, next.options)` — which is **always false** because options is a new reference each render. **Result: every publish (every edit) re-renders every node on the canvas, defeating the entire W3 per-node memo.** This is the instant-paint killer.
**Fix:** `useMemo` the options object in `ClientBuilderCanvas` (deps: the stable inputs — `publicPathPrefix`, `dataSources`, `components`, `visibilityContext`, `sectionEmbedIslands`, `includeRendererStyles`); the `renderSectionEmbed` closure must also be memoized (it closes over `sectionEmbedIslands`). Then a tree publish only changes the `node` references that actually changed → only those subtrees repaint. **This is the single highest-leverage perf change in the builder.** Pairs with a `React.memo` on `ClientBuilderCanvas` itself.
Effort S · risk low.

### CW-2 (high) — Get the two HOVER ids out of the context value
**Files:** declarations `edit-context.tsx:1968-1971`; writers `selection-layer.tsx:1004/1019`, `freeform-layers-tree.tsx:550/556`, `navigator-panel.tsx:2331/2350`, `iframe-bridge.tsx:289`; readers (only 5): `selection-layer`, `edit-shell`, `navigator-panel`, `freeform-layers-tree`, `iframe-bridge`.
Hover is the highest-frequency context write and the readers are a *small, known set*. Publishing `hoveredSectionId` / `hoveredBuilderNodeId` through a tiny `useSyncExternalStore` store (clone the `client-builder-canvas-bridge.ts` pattern, ~50 lines) — or a dedicated `HoverContext` provider mounted *inside* `EditProvider` — means a hover boundary crossing re-renders **only those ~5 hover-reading components**, not all 41. Remove both ids from the `value` object + deps array.
Effort M · risk low (writers/readers fully enumerated above).

### CW-3 (high) — Same treatment for `dirty` (and consider `selectedSectionId`)
`dirty` flips to `true` on the FIRST edit of a burst and is a `value` dep (**6290**) → contributes a full-editor re-render on edit. It's read by very few components (the save indicator / unsaved-guard). Move it to a 1-field store or secondary context. `selectedSectionId` selection changes on every click and is read more widely; it's a good candidate for the same micro-store but measure its reader fan-out first.
Effort M · risk low–medium.

### CW-4 (medium) — Split the value into "stable" vs "volatile" halves (cheap structural, NOT the full Sub-step E)
Most of the ~180 fields are **stable callbacks** (`insertBuilderNode`, `moveBuilderNodeToIndex`, all the `open*/close*` drawer fns, `undo`, `redo`, …) that never change identity after mount. Today they sit in the same object as the volatile primitives, so they get a *new wrapper object* on every volatile change even though their own identity is stable. Splitting into two providers — `EditActionsContext` (stable fns, value rebuilds ~never) and `EditStateContext` (volatile primitives) — lets the ~20 action-only consumers (e.g. `instance-overrides-panel.tsx` reads only `setInstanceOverride`; `site-header` tabs read only `workspaceMembershipSlug`) stop re-rendering on state churn entirely. This is a *bounded* split (2 contexts, mechanical) — much smaller than a full per-domain decomposition.
Effort L · risk medium.

### CW-5 (low, do FIRST as the seatbelt) — Add a render-count regression test
**There is no React Profiler / render-count harness** for the editor today (verified: the `edit-chrome/*.test.ts` files are logic/unit tests only). Before touching the provider, add a test that mounts `EditProvider` with a couple of instrumented consumers and asserts the render count for: (a) a hover boundary change, (b) a single tree commit, (c) a drawer open. This is the "seatbelt before surgery" — it both proves the current tax and prevents regressions as CW-1..4 land. It also lets you *profile* (the audit's "instant paint UNPROFILED" gap) with real numbers instead of guessing.
Effort S · risk low.

---

## VERDICT on "Sub-step E" (full provider split)

**Not necessary for instant paint.** The dominant costs are:
- (a) the canvas itself repainting fully on every edit — caused by an **unstable options object (CW-1)**, a pure bug, fixed in ~5 lines with zero architecture change; and
- (b) the *whole editor* re-rendering on hover/selection/dirty — caused by **high-churn primitives riding in the monolithic value (CW-2/CW-3)**, fixable by relocating ~3-4 fields to a micro-store without restructuring the other 175.

Once CW-1 lands, an edit repaints only the changed subtree. Once CW-2/CW-3 land, a hover/selection re-renders ~5 components instead of 41. That is "instant paint" for the canvas and a quiet editor for everything else.

A full decomposition (CW-4 is the *bounded* version; "Sub-step E" implies going further into per-domain providers + a selector store) is **defensible as later polish** — it would let the ~20 action-only consumers stop re-rendering on the *remaining* volatile changes — but it is high-effort, touches all 41 consumers, and delivers diminishing returns *after* CW-1/2/3. **Sequence: CW-5 (seatbelt) → CW-1 (the bug) → profile → CW-2 → CW-3 → re-profile → decide whether CW-4/full-split is still worth it.** In all likelihood it will not be required to hit the "feels like a program" bar; keep it optional and measurement-gated.

### Sequencing / parallelism
All five touch `edit-context.tsx` (the shared core) plus a small satellite file each, so CW-1..4 **must be sequential** (serial edits to the provider) — but CW-1 is in `client-builder-canvas.tsx` + `render.tsx` and is independent of the others, so it can land in parallel with CW-5. This is **Wave-1 foundational work**: the Fast score (60) is gated here, and several other marathon lanes (drag polish, hero embed latency) will want the seatbelt test + stable canvas in place first.
