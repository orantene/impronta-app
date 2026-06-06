# Regression test harness — seatbelt audit

Area key: `regression-test-harness`
Date: 2026-06-05

## What exists today

### Two test runners running in parallel

All builder unit tests use `node:test` via `tsx --test` (pure ESM, zero browser, fast).  
The one exception is `test/components/edit-chrome/edit-context.test.tsx`, which uses `vitest` + `@testing-library/react` because it needs a DOM for `renderHook`.

### Existing coverage by mutation type

| Mutation | Covered? | Test file(s) |
|---|---|---|
| **add node** | YES | `operations.test.ts` (insertBuilderNode, all policies) |
| **move node** | YES | `operations.test.ts` (reorder, cross-parent, ancestor-loop guard) |
| **delete node** | YES | `operations.test.ts` (removeBuilderNode, min-items guard) |
| **duplicate node** | YES | `operations.test.ts` (duplicateBuilderNode, tab id remap) |
| **paste node** | YES | `operations.test.ts` (pasteBuilderNode, fresh ids) |
| **edit text/props (patch)** | YES | `operations.test.ts` (patchBuilderNodeProps, validation, no-op guard) |
| **undo** | YES | `builder-node-undo-transaction.test.ts` (immutability, LIFO, redo, no-op) |
| **redo** | YES | same file |
| **multi-select delete/duplicate** | YES | `multi-node-transforms.test.ts` (removeBuilderNodes, duplicateBuilderNodes) |
| **multi-select group/ungroup** | YES | `multi-node-transforms.test.ts` (groupSiblingBuilderNodes, ungroupBuilderNode) |
| **clipboard serialize/paste** | YES | `multi-node-transforms.test.ts` (cross-page paste, id re-mint) |
| **publish preflight** | YES | `publish-preflight-rules.test.ts`, `publish-preflight-layout-rules.test.ts`, `publish-preflight-link-rules.test.ts` |
| **publish diff** | YES | `publish-diff.test.ts` |
| **editor ↔ published parity** | YES | `builder-node-editor-published-parity.test.ts` (P3 fields survive Zod round-trip) |
| **style classes (merge/resolve/strip)** | YES | `style-classes.test.ts` (class base + node override, classRef strip, cascade) |
| **save / version conflict / rollback** | NO | |
| **classes publish gap** | NO | |
| **bridge: publishBuilderCanvasTree** | NO | |
| **undo/redo dispatch → persistBuilderTree** | NO | |
| **save debounce coalesce** | NO | |

### Test files NOT wired into `npm run ci` (not in any npm script)

These files exist and pass, but they are orphans — `npm run ci` and `npm run test:builder-node-bindings` never run them:

```
src/components/edit-chrome/canvas-align-guides.test.ts         (node:test)
src/components/edit-chrome/edit-path.test.ts                   (node:test)
src/components/edit-chrome/freeform-layer-name.test.ts         (node:test)
src/components/edit-chrome/multi-node-layout.test.ts           (node:test)
src/components/edit-chrome/multi-node-selection.test.ts        (node:test — vitest too)
src/components/edit-chrome/multi-node-transforms.test.ts       (node:test)
src/components/edit-chrome/navigator-collapse.test.ts          (node:test)
src/components/edit-chrome/rich-editor/transformers/transformers.test.ts (node:test)
src/components/edit-chrome/workspace-layout.test.ts            (node:test)
src/lib/site-admin/builder-node/canvas-node-drop.test.ts       (node:test)
src/lib/site-admin/builder-node/collab-audit.test.ts           (node:test)
src/lib/site-admin/builder-node/component-instances.test.ts    (node:test)
src/lib/site-admin/builder-node/field-map.test.ts              (node:test)
src/lib/site-admin/builder-node/mobile-health.test.ts          (node:test)
src/lib/site-admin/builder-node/performance-budget.test.ts     (node:test)
src/lib/site-admin/builder-node/section-eject.test.ts          (node:test)
src/lib/site-admin/builder-node/section-embed-presets.test.ts  (node:test)
src/lib/site-admin/builder-node/style-classes.test.ts          (node:test)
src/lib/site-admin/builder-node/style-token-bindings.test.ts   (node:test)
src/lib/site-admin/builder-node/visibility-render.test.ts      (node:test)
src/lib/site-admin/builder-node/visibility-roundtrip.test.ts   (node:test)
src/lib/site-admin/builder-node/visibility.test.ts             (node:test)
test/components/edit-chrome/edit-context.test.tsx              (vitest)
```

`style-classes.test.ts` is particularly significant given the classes-don't-publish trust bug: it exists and covers the merge/resolve logic well, but it never runs in CI so a regression there goes undetected.

---

## Critical uncovered mutations

### 1. Save / version conflict / rollback (CRITICAL)

**What the code does** (edit-context.tsx lines 3969–4077, 4141–4197):

- `commitBuilderTreeMutation` (line 4141) applies the tree optimistically, pushes one undo entry, then arms a debounce timer (`BUILDER_SAVE_DEBOUNCE_MS`).
- The debounce fires `flushBuilderTreeSaveRef.current()` which calls `persistBuilderTree`.
- `persistBuilderTree` (line 3969) calls `saveDraftHomepageAction({ expectedVersion: activePageVersion, ... })`.
- On `VERSION_CONFLICT`: rolls back `builderTreeRef.current` + `setBuilderTree(prevTree)`, calls `refreshComposition()`, surfaces `reportMutationError`. **The undo entry for the rolled-back change remains on the stack** — this is the under-tested state.
- On network failure: same rollback but no `refreshComposition`.
- The `pageVersionRef.current` CAS guard is read-at-call-time (a ref, not state) to avoid stale closures.
- `dispatchMutation` (line 3532, for composition mutations) has the same optimistic-apply → rollback → VERSION_CONFLICT path.

**What is NOT tested:**

- That `commitBuilderTreeMutation` leaves the undo stack in a consistent state after a failed `persistBuilderTree` (the undo entry must be pruned on rollback, or undo correctly sees the pre-change tree).
- That `persistBuilderTree` passes `rollbackTarget` (the last confirmed tree, not the latest optimistic tree) correctly when multiple bursts are coalesced by the debounce.
- That `VERSION_CONFLICT` triggers `refreshComposition` exactly once and does not leave `saving = true`.
- That a `network` failure does NOT call `refreshComposition` (so the user does not lose their editor state on a transient error).

The `builder-node-undo-transaction.test.ts` file explicitly calls out that "async persistence / optimistic CAS are intentionally omitted" (line 51). This is the gap.

### 2. Classes-don't-publish (HIGH)

**What the code does:**

- Style classes are authored in `LinkedStyleClassesBar` (navigator-panel.tsx:4048–4072) and stored in `localStorage` under key `tulala:builder:style-classes:v1:{pageId}`.
- Nodes reference a class by `style.classRef` (a string id stored inside the builder tree, which IS persisted to the DB).
- At render time, all three callers of `renderBuilderNodes` in production (`homepage-cms-sections.tsx:321`, `homepage-cms-sections.tsx:601`, `PublishedShell.tsx:326`) call it WITHOUT passing `styleClasses`. The optional `styleClasses` parameter defaults to `{}` (render.tsx:3207).
- `applyStyleClass` (render.tsx:2386) therefore finds no match in the empty registry and returns the node unchanged — the node's raw `style.classRef` is stripped but the class styles are never merged in.
- **Result:** any node with a `classRef` renders with its own overrides only; the class base styles are silently dropped on the published page and in the server-rendered canvas.
- The client canvas (`client-builder-canvas.tsx:101`) also omits `styleClasses`, so even in edit mode with the W3 client canvas flag ON, the class styles are invisible.

**What is NOT tested:**

- A round-trip characterization test that proves a `classRef` in the tree reaches the render output. Such a test would fail today and make the bug impossible to miss.
- A publish-parity test analogous to `builder-node-editor-published-parity.test.ts` that threads a `styleClasses` registry through both the editor and published render paths and asserts they match, and that a `classRef` on a node actually applies the class styles to the output HTML.

### 3. Bridge immutability / reference identity (MEDIUM)

**What the code does** (`client-builder-canvas-bridge.ts`):

- `publishBuilderCanvasTree(tree)` uses `Object.is` to skip publishing if the reference is unchanged (line 35). This is critical: if `EditProvider` passes a new object with the same structure (not the same reference), the bridge fires, the canvas re-renders, and React's `memo` boundaries are tripped.
- The contract "callers must pass the same immutable-update tree they hold in state (not a clone)" is documented but not enforced.

**What is NOT tested:**

- That `publishBuilderCanvasTree` skips listeners when the same reference is re-published.
- That `publishBuilderCanvasTree` fires listeners when a new reference (even with identical content) is published.
- That `getBuilderCanvasTreeSnapshot` returns the last published reference exactly (no clone on read).

---

## Test files to create

### Tier 1 — required before context split (must exist, must be in CI)

#### `src/lib/site-admin/builder-node/save-conflict-protocol.test.ts`

Runner: `node:test` via `tsx --test` (no DOM, no React, no server action).

Tests to write (all pure functions / state machines):

```
// The persist-layer contract, exercised against a local state machine that
// mirrors the commitBuilderTreeMutation → persistBuilderTree → rollback path.
//
// Concretely: a BuilderSaveSimulator with:
//   present: BuilderNodeTree
//   past: HistoryEntry[]
//   pageVersion: number | null
//   saving: boolean
//   lastConfirmedTree: BuilderNodeTree
//
// Methods that mirror edit-context.tsx:
//   commitMutation(nextTree)      — applies optimistic, pushes undo, arms debounce
//   flushSave(outcome)            — resolves the debounce; outcome = ok|conflict|network
//   undo() / redo()
//
// Tests:
1. "commitMutation leaves undo stack at depth+1; flushSave(ok) keeps it at depth+1 and updates pageVersion"
2. "flushSave(conflict) rolls back present to rollbackTarget, does NOT pop the undo entry (stack depth stays +1)"
   — this pins the current behavior; if you want the entry pruned, the test must be updated
3. "flushSave(conflict) sets saving=false (no stuck spinner)"
4. "flushSave(network) rolls back present, does NOT call refreshComposition"
5. "burst: commitMutation twice, only one flushSave call (debounce coalesced), rollbackTarget = lastConfirmedTree not the first optimistic tree"
6. "undo after a successful save navigates to the pre-save tree, redo returns to the post-save tree"
7. "undo after a failed save navigates to the pre-change tree (the rollback tree, not the conflicted one)"
```

#### `src/lib/site-admin/builder-node/classes-publish-parity.test.ts`

Runner: `node:test` via `tsx --test` (uses `renderToStaticMarkup`, no DOM).

Tests to write:

```
// Characterization tests that document the current state and the desired state.
// Mark the current-behavior tests with a comment "// KNOWN BUG: should not be empty"
// so the context split agent knows which assertions to flip when classes are fixed.

1. "KNOWN BUG: classRef on a node does NOT reach the published HTML when styleClasses is omitted"
   — renders a tree with a node whose style.classRef = 'promo' and a class registry
     defining 'promo' with textColor='#cc0000', calls renderBuilderNodes WITHOUT styleClasses,
     asserts the output does NOT contain '#cc0000' — this documents the bug.

2. "classRef on a node DOES reach the HTML when styleClasses is explicitly threaded"
   — same tree, calls renderBuilderNodes WITH styleClasses = { promo: { ... } },
     asserts the output DOES contain '#cc0000' and the classRef attribute is stripped.

3. "a classRef node with no matching class in the registry renders its own overrides only (safe fallback)"
   — asserts textColor from the node's own style is present; no crash.

4. "resolveBuilderTreeClassRefs flattens classRefs before publish-resolve preserves them"
   — feeds a tree through resolveBuilderTreeClassRefs then resolveSnapshotBuilderTreeForPublish,
     asserts the output tree has no dangling classRefs and the merged style values are present.
```

#### `src/lib/site-admin/builder-node/bridge-reference-identity.test.ts`

Runner: `node:test` via `tsx --test` (no DOM, pure module test of the bridge singleton).

Tests to write:

```
1. "publishBuilderCanvasTree fires listeners on a new reference"
2. "publishBuilderCanvasTree does NOT fire listeners when the same reference is re-published (Object.is)"
3. "publishBuilderCanvasTree fires listeners on a structurally equal but distinct reference"
   — this pins the current 'strict reference equality' contract and will catch a future
     clone-on-every-render regression that would cause infinite render loops.
4. "getBuilderCanvasTreeSnapshot returns the exact reference that was published, not a clone"
5. "subscribeBuilderCanvasTree unsubscribe removes the listener"
6. "multiple listeners all fire on a single publish"
```

Note: this file tests `client-builder-canvas-bridge.ts`. The bridge is a module singleton, so reset between tests by re-importing via a resetable module or by wrapping each test in a fresh listener and checking call counts (the simplest approach with no module-reset machinery).

### Tier 2 — wire orphan tests into CI (zero new code; just package.json changes)

Add a new script `test:builder-chrome` to `package.json` and add it to both `npm run ci` and `npm run verify:builder-ownership`:

```json
"test:builder-chrome": "tsx --test src/components/edit-chrome/canvas-align-guides.test.ts src/components/edit-chrome/edit-path.test.ts src/components/edit-chrome/freeform-layer-name.test.ts src/components/edit-chrome/multi-node-layout.test.ts src/components/edit-chrome/multi-node-transforms.test.ts src/components/edit-chrome/navigator-collapse.test.ts src/components/edit-chrome/workspace-layout.test.ts src/lib/site-admin/builder-node/canvas-node-drop.test.ts src/lib/site-admin/builder-node/collab-audit.test.ts src/lib/site-admin/builder-node/component-instances.test.ts src/lib/site-admin/builder-node/field-map.test.ts src/lib/site-admin/builder-node/mobile-health.test.ts src/lib/site-admin/builder-node/performance-budget.test.ts src/lib/site-admin/builder-node/section-eject.test.ts src/lib/site-admin/builder-node/section-embed-presets.test.ts src/lib/site-admin/builder-node/style-classes.test.ts src/lib/site-admin/builder-node/style-token-bindings.test.ts src/lib/site-admin/builder-node/visibility-render.test.ts src/lib/site-admin/builder-node/visibility-roundtrip.test.ts src/lib/site-admin/builder-node/visibility.test.ts"
```

`multi-node-selection.test.ts` and `rich-editor/transformers/transformers.test.ts` and `test/components/edit-chrome/edit-context.test.tsx` (vitest) should be added to `test:components` (vitest) or a separate `test:builder-chrome:vitest` script.

Add Tier 1 tests to `test:builder-node-bindings`:

```
src/lib/site-admin/builder-node/save-conflict-protocol.test.ts
src/lib/site-admin/builder-node/classes-publish-parity.test.ts
src/lib/site-admin/builder-node/bridge-reference-identity.test.ts
```

---

## Summary: mutation coverage map

| Mutation | Unit covered? | In CI? | Notes |
|---|---|---|---|
| add | YES | YES | operations.test.ts |
| move | YES | YES | operations.test.ts |
| delete | YES | YES | operations.test.ts |
| duplicate | YES | YES | operations.test.ts |
| paste (cross-page) | YES | NO (orphan) | multi-node-transforms.test.ts not in CI |
| edit text/props | YES | YES | patchBuilderNodeProps in operations.test.ts |
| undo | YES | YES | builder-node-undo-transaction.test.ts |
| redo | YES | YES | same |
| multi-select ops | YES | NO (orphan) | multi-node-transforms.test.ts not in CI |
| save ok path | NO | NO | save-conflict-protocol.test.ts needed |
| save VERSION_CONFLICT | NO | NO | same |
| save network failure | NO | NO | same |
| version conflict rollback state | NO | NO | same |
| classes render on publish | NO (characterizes bug) | NO | classes-publish-parity.test.ts needed |
| bridge reference identity | NO | NO | bridge-reference-identity.test.ts needed |
| rich-text round-trip | YES | NO (orphan) | transformers.test.ts not in CI |

---

## Sequencing relative to the context split

Do these three things in order before touching edit-context.tsx:

1. Wire the 23 orphan tests into CI (`test:builder-chrome` npm script, 1-hour task).
2. Write `save-conflict-protocol.test.ts` — establishes the exact rollback contract the context split must not break.
3. Write `classes-publish-parity.test.ts` — documents the bug so the classes-publish fix is test-driven.
4. Write `bridge-reference-identity.test.ts` — pins the bridge contract Sub-step E must honor.

Only after all four pass in CI is the seatbelt on.
