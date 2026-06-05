# Parallel Collision Audit — Builder Marathon Plan (2026-06-05)

Challenge: verify every task tagged "parallel" in `builder-marathon-plan-2026-06-05.md` against the
actual source files. Flag tasks that secretly collide on `edit-context.tsx`, `render.tsx`,
`navigator-panel.tsx`, or other shared modules and would produce merge conflicts if run concurrently.

All findings sourced from `/Users/oranpersonal/Desktop/impronta-builder-marathon` (branch
`builder/marathon-2026-06-05`). File sizes confirmed: `edit-context.tsx` 6437 LOC,
`render.tsx` 3341 LOC, `navigator-panel.tsx` 4472 LOC, `selection-layer.tsx` 6396 LOC,
`edit-shell.tsx` 1918 LOC, `style-panel.tsx` 9630 LOC.

---

## FINDINGS (ordered by severity)

### COLLISION 1 — W3-T1 touches `edit-context.tsx` but is ABSENT from the provider serialize chain

**Severity: HIGH — will cause a merge conflict if run concurrently with any Wave 3 provider task.**

W3-T1 ("insert/delete/reorder MOTION") requires exposing `lastInsertedNodeId` from the context
(`edit-context.tsx`). The plan's "SERIALIZE on edit-context.tsx" chain is:
`W1-T4 → W1-T5 → W2-T2 → W2-T3 → W2-T4 → W3-T2 → W3-T8 → W4-T4(b,c) → W5-T6`.
**W3-T1 is missing.**

W3-T1 is listed under Wave 3 and the plan says it "lives in render.tsx → can land in PARALLEL with
Wave 1." That is correct for the `render.tsx` motion wrapper. But the plan also says it "SERIALIZE on
render.tsx after W2-T1." The part that touches `edit-context.tsx` (the `lastInsertedNodeId` exposure)
puts W3-T1 in contention with W3-T2 and W3-T8, which both mutate the same file in the same wave.

**Fix:** Insert W3-T1's context edit into the provider lane — `W3-T2 → W3-T1 (context edit only) → W3-T8`
or batch W3-T1's context change into the W3-T2 PR since both are in the same wave.

---

### COLLISION 2 — W0-T6 (profiler instrumentation) touches `edit-context.tsx` and `render.tsx`
### but is NOT listed in either serialize chain

**Severity: MEDIUM — Wave 0 runs first, so this won't cause a live conflict, but the omission
will confuse future agents who treat the serialize lists as exhaustive.**

W0-T6 adds `React.Profiler` wrapping (or `console.count()` in the `value = useMemo` factory at
`edit-context.tsx:6032`) and a probe in `renderBuilderNodes` (`render.tsx:3196`).

Neither the "SERIALIZE on edit-context.tsx" chain nor the "SERIALIZE on render.tsx" chain mentions
W0-T6. The plan notes W0-T6 as having "no-op in prod" instrumentation, but the source edits are
real line changes in both files. Any Wave 1+ agent rebasing on main must take the W0-T6 diff into
account.

**Fix:** Prepend W0-T6 to both serialize chains: `W0-T6 → W1-T4 → …` and `W0-T6 → W1-T2 → W2-T1 → W3-T1`.
Or, consolidate the W0-T6 probe entirely into `edit-chrome-mount.tsx` and `homepage-cms-sections.tsx`
(the Profiler wrapper mounts) and a NEW file, avoiding the shared-core edits entirely — cleaner.

---

### COLLISION 3 — W6 Easy lane claims `edit-shell.tsx` is DISJOINT, but W3-T2 also modifies it

**Severity: MEDIUM — the W6 Easy lane is explicitly declared a "fully concurrent lane from Wave 1
onward" but it touches `edit-shell.tsx` in the same file as W3-T2.**

W3-T2 ("Save-failure + conflict recovery") modifies `edit-shell.tsx:1353–1476` (`MutationErrorToast`,
`mutationCodeSuggestion`, auto-dismiss timer). W6-T2 ("Post-apply checklist") modifies `edit-shell.tsx`
near `FirstPaintTip` at line 1080.

These are ~270 lines apart in the same 1918-line file. A standard Git merge will not conflict if no
overlapping hunks are touched, but the plan says the W6 Easy lane "touches only `empty-canvas-starter.tsx`,
`edit-shell.tsx`, `navigator-panel.tsx`, `starter-action.ts`" and calls it "No edit-context / render /
style-panel contention." This is accurate on those three shared-core files, but the plan's "DISJOINT"
label for `edit-shell.tsx` is misleading — `edit-shell.tsx` is a shared file with another wave's work.

**Actual risk:** Low (the hunks are far apart and neither imports the other's new symbols), but if W3-T2
and W6-T2 land simultaneously the diff reviewer must check both hunks before merging to catch any
import or re-export collision at the file top.

**Fix:** Annotate the W6-T2 task as "disjoint from edit-context/render/style-panel; coordinate hunk
regions with W3-T2's edit-shell.tsx change." Not a hard serialize requirement, just a review note.

---

### COLLISION 4 — W2-T3 (hover micro-store) incorrectly lists `navigator-panel.tsx` as a consumer

**Severity: LOW — this is a false claim in the plan, not a merge conflict risk. It causes wasted
effort if an agent follows the plan literally.**

W2-T3 says: "subscribe in the ~4–5 readers (selection-layer, navigator-panel, freeform-layers-tree,
canvas hover ring, iframe-bridge)."

Source audit: `navigator-panel.tsx:314` declares its own LOCAL `hoveredSectionId` state via
`useState<string | null>(null)`. The hover values in navigator-panel.tsx never flow through
`useEditContext()`. The panel reads only specific non-hover values from context (e.g. `builderTree`,
`pageId`). Its setters at lines 2331 and 2350 call the local setter, not the context setter.

The REAL consumers of the context's `hoveredSectionId` / `hoveredBuilderNodeId` that W2-T3 must
migrate are:
- `selection-layer.tsx:583–586` — reads and sets both (confirmed)
- `freeform-layers-tree.tsx:287–289` — reads both, sets `hoveredBuilderNodeId` (confirmed)
- `iframe-bridge.tsx:109–146` — reads `hoveredSectionId` (confirmed)
- `edit-shell.tsx:1175` — reads both in `FirstPaintTip` (confirmed)
- The ~4 setters on `selection-layer.tsx:1004,1018` remain as the write path

`navigator-panel.tsx` does NOT need to be touched by W2-T3. The "canvas hover ring" is part of
`selection-layer.tsx`, not navigator-panel.

**Fix:** Remove `navigator-panel.tsx` from W2-T3's file list. The accurate list is:
`hover-bridge.ts` (new), `edit-context.tsx` (setters + value deps), `selection-layer.tsx`,
`freeform-layers-tree.tsx`, `iframe-bridge.tsx`, `edit-shell.tsx`.

---

### COLLISION 5 — Three-way collision on `homepage-cms-sections.tsx` line 321 (not flagged as needing ONE PR)

**Severity: LOW-MEDIUM — the plan's "Cross-lane coordination hazards" section identifies a 2-way
hazard but misses that W2-T1 also lands in the same file at the same call site.**

The plan's hazard note says W1-T2 and W4 both touch the 4 `renderBuilderNodes` call sites and "must
be ONE PR." But W2-T1 also modifies `client-builder-canvas.tsx:101` (one of the 4 call sites) to
wrap the canvas in `React.memo` and add `useMemo` over the options object. And W4-T4(b) deletes the
flag-off fallback at `homepage-cms-sections.tsx:317–332`, which includes the call at line 321.

The actual dependency graph for the `renderBuilderNodes` call sites is:
1. W1-T2: threads `styleClasses` parameter into all 4 call sites.
2. W2-T1: wraps the options object in `useMemo` in `client-builder-canvas.tsx:101`. (Must follow W1-T2
   to avoid double-patching the same call site in separate PRs.)
3. W4-T4(b): deletes `homepage-cms-sections.tsx:317–332` (removes the flag-off path that includes
   call site at line 321). (Must follow W1-T2.)

W2-T1 is not in the plan's "Cross-lane coordination hazards" list for this file, even though it
modifies a call site that W1-T2 also modifies. If W1-T2 and W2-T1 land in separate PRs both editing
`client-builder-canvas.tsx:101`, they will conflict.

**Fix:** Merge W1-T2's `client-builder-canvas.tsx` change and W2-T1's options-memo change into a
single PR, or strictly sequence W2-T1 after W1-T2 merges. The plan already says W2-T1 "can land in
PARALLEL with Wave 1" — that is only true for the `React.memo` wrapper on the component; the call-site
option object change at line 101 must follow W1-T2's `styleClasses` threading of that same line.

---

## CONFIRMED PARALLEL CLAIMS (genuinely disjoint, no hidden collisions found)

The following "disjoint" claims were verified against source and HOLD:

| Claim | Verified |
|---|---|
| W0-T1 (`package.json`) is independent of all other Wave 0 tasks | YES — only touches `package.json` |
| W0-T2/T3/T4/T5 are new test files, independent of each other | YES — each creates a new file |
| W1-T1 + W1-T3 (class storage + labeling) parallel to provider lane | YES — W1-T1 creates a new `style-classes-storage.ts`; W1-T3 touches `navigator-panel.tsx:1526-1559` and `linked-style-classes-bar.tsx` — neither is a shared-core file |
| W3-T5 (color unification — `kit/color-picker.tsx`, `ColorRow.tsx`, `css-value-builders.tsx`) | YES — no shared-core overlap |
| W3-T6 (handle HUDs — `canvas-resize-handles.tsx`, `canvas-spacing-handles.tsx`) | YES — disjoint files |
| W3-T7 (skeletons — `inspector-dock.tsx`, `*-drawer.tsx`) | YES — disjoint from all serialize chains |
| W4-T1 (bridge `node-presentation-bridge.ts`) | YES — new file + new test |
| W4-T3 (eject `section-eject.ts`) | YES — disjoint from style-panel serialize chain |
| W4-T4(a/d/e) (`PagesComposerList.tsx` delete / `MeshGradientGenerator.tsx` / `collab-audit.ts`) | YES — mechanical deletes/guards in non-shared-core files |
| W5-T4 (crop zoom/pan — `image-crop.tsx`) | YES — fully standalone |
| W6-T3 (honest copy — `empty-canvas-starter.tsx:769-774,929-933`, `navigator-panel.tsx:1526-1559`) | YES — W6-T3's navigator touch (tab labels) is disjoint from W2-T3 (which does NOT actually need navigator-panel.tsx per finding #4) |
| W6-T4 (thumbnails + scratch momentum — `empty-canvas-starter.tsx`) | YES — independent of all serialize chains |

---

## SERIALIZE CHAIN CORRECTIONS (amended)

### edit-context.tsx (corrected)
W0-T6 (profiler probe — if not extracted to new file) → W1-T4 → W1-T5 → W2-T2 → W2-T3 → W2-T4 → **W3-T1 (lastInsertedNodeId only)** → W3-T2 → W3-T8 → W4-T4(b,c) → W5-T6

### render.tsx (corrected)
W0-T6 (profiler probe — if not extracted to new file) → W1-T2 (styleClasses thread at call sites, NOT render.tsx itself — already has the param) → W2-T1 (options memo in `client-builder-canvas.tsx`) → W3-T1 (motion wrapper)

Note: the render.tsx serialize chain is partially misspecified in the plan. W1-T2 does not actually
modify `render.tsx` (the `styleClasses` parameter at `render.tsx:3207` already exists). W1-T2 only
touches the call sites in `homepage-cms-sections.tsx`, `client-builder-canvas.tsx`, and
`PublishedShell.tsx`. W2-T1 modifies `client-builder-canvas.tsx` (not render.tsx itself). W3-T1
adds a motion wrapper in render.tsx. So the real render.tsx single-writer constraint is just
W3-T1 — and it should be serialized after W2-T1 (which touches the same call site in
`client-builder-canvas.tsx`).

### client-builder-canvas.tsx (not in plan's serialize tables — needs its own chain)
W1-T2 (styleClasses parameter) → W2-T1 (React.memo + useMemo options)

---

## SUMMARY TABLE

| Finding | Severity | Plan's claim | Reality | Action |
|---|---|---|---|---|
| W3-T1 missing from edit-context.tsx serialize chain | HIGH | W3-T1 = render.tsx only | Also touches edit-context.tsx (lastInsertedNodeId) | Add W3-T1 to provider chain after W2-T4 |
| W0-T6 missing from both serialize chains | MEDIUM | W0-T6 listed as disjoint | Modifies edit-context.tsx:6032 + render.tsx:3196 | Add to both chains, or extract probes to new file |
| W6 Easy lane claims edit-shell.tsx DISJOINT | MEDIUM | No shared-core contention | edit-shell.tsx is also modified by W3-T2 | Note for review; not a hard serialize but a coordination note |
| W2-T3 incorrectly lists navigator-panel.tsx | LOW | navigator-panel is a hover consumer | navigator-panel hover is local useState (line 314), not from context | Remove navigator-panel.tsx from W2-T3 file list |
| 3-way call-site collision on client-builder-canvas.tsx:101 | LOW-MEDIUM | W1-T2 + W4 noted as ONE PR hazard | W2-T1 also touches the same call site | Sequence W2-T1 strictly after W1-T2 on this file; or land as one PR |
