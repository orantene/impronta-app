# Marathon findings — Undo/redo + save-conflict recovery

Area key: `undo-redo-save-conflict`
Audited worktree: `/Users/oranpersonal/Desktop/impronta-builder-marathon`
Primary file: `web/src/components/edit-chrome/edit-context.tsx`
Date: 2026-06-05

> This is "the soul of feels-like-a-program." The audit (74/100) never scored it.
> Verdict: the **happy path is genuinely good** — uniform optimistic+CAS+rollback,
> a single LIFO timeline across three mutation kinds, debounce coalescing, and
> localStorage undo-survives-reload. But there are **real correctness + trust
> holes** at the edges, and **zero direct test coverage of the production
> closure** (the one test is an admitted re-implementation). Seatbelt first.

---

## How it actually works today (cite-level map)

### History model
- `type HistoryEntry` (edit-context.tsx:1089-1107) is a 3-way discriminated union:
  - `composition` — captures `{ slots, metadata }` snapshot (NOT the builderTree).
  - `builderTree` — captures `{ pre, post }` deep clones of the whole node tree.
  - `field` — captures one section's `{ sectionId, sectionTypeKey, schemaVersion, name, pre, post }` props.
- Two stacks: `past` / `future` (2185, 2210). `HISTORY_CAP = 50` (2211), `capHistory` slices the tail (2212-2216).
- `#18 undo-survives-reload`: the last `UNDO_PERSIST_CAP = 10` (2182) `past` entries are
  written to `localStorage["builder_undo_stack_v1:"+pageId]`, debounced ~500ms (2254-2269),
  flushed sync on `pagehide`/`visibilitychange→hidden`/unmount (2274-2288). Rehydrated on
  mount with a shape filter (2185-2208). `future` is NOT persisted.

### Mutation → history wiring
- **Every builder-node op** (move, insert, duplicate, paste, patch, group, ungroup,
  align, distribute, multi-node transforms) routes through `executeBuilderNodeOperation`
  (4201) → `commitBuilderTreeMutation` (4141), which pushes exactly ONE `builderTree`
  entry (4169-4178) and clears redo (4179). Multi-node ops apply the whole transform in a
  single `run` (e.g. `mergeStylePatchIntoTree(tree, nodeIds, patch)` at 5440) → ONE entry,
  not N. This is clean and atomic. ✅
- **Composition moves** (reorder/move/remove section, metadata) route through
  `dispatchMutation` (3532) which pushes a `composition` snapshot entry (3546-3548) and
  clears redo (3549). `moveSectionTo` (3836) and the dispatch `composition.*` branches all
  funnel here. ✅
- **Section field edits** record history ONLY via `recordFieldEdit` (5745), which is
  called from exactly ONE place: `inspector-dock.tsx:505` after a successful field autosave.
  Legacy inline canvas text/image edits write to `draftProps`+`setDirty(true)`
  (`inline-editor.tsx:461-462`, `commitText`) and rely on that same inspector autosave
  effect (`inspector-dock.tsx:455-512`) to flush + record. ✅ (for the section path)

### Save path + CAS
- `persistBuilderTree` (3969) — optimistic `setBuilderTree(next)`, then
  `saveDraftHomepageAction` with `expectedVersion = pageVersionRef.current`. On failure it
  reverts to `prevTree` (or an explicit `rollbackTarget`) and, on `VERSION_CONFLICT`, calls
  `refreshComposition()` + surfaces a toast (4015-4051).
- Coalescing: `commitBuilderTreeMutation` arms a 750ms debounce (`BUILDER_SAVE_DEBOUNCE_MS`,
  2120) into `flushBuilderTreeSave` (4095), serialized through `builderTreeSaveQueueRef`
  (4110-4113). On a coalesced-save failure it pops `pendingHistoryCountRef` entries off
  `past` (4119-4124) so undo depth matches the last-confirmed tree.
- `undo`/`redo` (5644 / 5692): guard `if (saving) return`; flush any pending coalesced save
  FIRST (`await flushBuilderTreeSaveRef.current()`, 5649-5651 / 5697-5699) so versions
  serialize, then branch by kind and replay via `restoreSnapshot` / `persistBuilderTree` /
  `applyFieldEdit`, rolling the entry back onto its source stack if the replay fails.
- `refreshComposition` (2995) wipes BOTH stacks (3004-3005) on every authoritative reload.
- `beforeunload` prompts on `dirty || saving` (2633-2641); pending builder saves flushed on
  `pagehide`/hidden (2651-2666); `saveDraft` (⌘S) flushes pending first (5979-5981).
- Keyboard: `⌘Z` / `⌘⇧Z` wired in `edit-shell.tsx:761-766`, bailed out when focus is in an
  input/contentEditable (`edit-shell.tsx:626-634`) so native text-undo wins inside fields.

---

## Problems (holes)

### P1 — `setSectionVisibility` and `renameSection` are NOT undoable (silent timeline gaps) — HIGH
`dispatch`'s `section.setVisibility` branch (3163-3207) and `section.rename` branch
(3280-3396) do their own optimistic apply + revert-on-error but **never push a HistoryEntry**
(no `setPast`, no `recordFieldEdit`). So:
- Hide a section → ⌘Z does nothing (or, worse, reverts the *previous, unrelated* edit).
- Rename a section → ⌘Z does nothing / reverts the wrong thing.

This is the classic "broken undo" trust break: ⌘Z silently skips a real change the operator
just made and reverts something earlier instead. `recordFieldEdit` is wired for inspector
*field* autosaves but not for these two `section.*` mutations.
Impact: two common, visible operations are invisible to history. Undo feels unreliable.

### P2 — No selection restore on undo/redo (operator loses their place) — HIGH (feel)
`HistoryEntry` carries no selection (1089-1107) and neither `undo` (5644-5690) nor `redo`
(5692-5738) touches `setSelectedBuilderNodeId` / `setSelectedSectionId` (confirmed: zero
selection setters in 5644-5739). Worse, the `liveSectionIds` cleanup effect (2743-2774) and
`removeBuilderNode`'s `removingActiveNode` branch (4834-4856) actively CLEAR selection when
the selected node leaves the tree. Net effect:
- Undo a delete → the node reappears but nothing is selected; the inspector goes empty.
- Undo an insert → the just-added (selected) node is removed and selection is cleared.
- Undo a style/text patch on node X → X is no longer selected; the inspector you were
  working in collapses.

In Figma/Webflow, ⌘Z re-selects the affected node and re-opens its inspector. Here every
undo dumps you back to "nothing selected." This is the single biggest "doesn't feel like a
program" gap in this subsystem. The fix is cheap: store `selectedBuilderNodeId` /
`selectedSectionId` on each entry and re-apply it post-replay.

### P3 — Zero direct test coverage of the real undo/redo/CAS closure (seatbelt is a mannequin) — HIGH
`web/src/lib/site-admin/builder-node/builder-node-undo-transaction.test.ts` is the ONLY
undo test. Its own header (lines 26-37, 49-52) admits it is a **faithful re-implementation**
(`class BuilderTreeHistory`) of the stack mechanics because the production seam "cannot be
imported without a DOM and a mocked save server action," and that "Async persistence /
optimistic CAS are intentionally omitted." Consequences:
- It tests only the `builderTree` kind. `field` and `composition` kinds, mixed-kind LIFO,
  the localStorage persist/rehydrate, the burst `pendingHistoryCountRef` rollback, and ALL
  `VERSION_CONFLICT` recovery have NO test.
- The mirror has already DRIFTED: it cites `edit-context.tsx:3451 / 3464 / 4744-4793 / 1815`,
  but the real code now lives at 4144 (no-op guard), 4179 (clear redo), 5644/5692 (undo/redo),
  2211 (`HISTORY_CAP`). The "line-cited mirror" cites lines that no longer mean what it says.

Per the marathon reframe ("seatbelt before surgery"), this is the prerequisite finding:
nothing else in this area should be refactored until the real provider has a JSDOM/mocked-
action harness exercising the actual `undo`/`redo`/`persistBuilderTree` closures.

### P4 — Persisted (cross-reload) undo can resurrect a stale tree over newer server state — MEDIUM
Rehydrated `past` entries (2185-2208) are replayed with NO reconciliation against the
freshly-loaded tree/version. A `builderTree` undo calls `persistBuilderTree(entry.pre)`
(5669), which writes `entry.pre` wholesale at the CURRENT `pageVersion` — CAS *accepts* it
because the version matches; it just doesn't notice the content is stale. So: edit page →
close tab → a co-editor (or the same user on another device) changes the page → reopen →
press ⌘Z → the page silently reverts to *your last session's* tree, clobbering the newer
work. The in-session conflict path is protected (CAS + `refreshComposition` wipes history),
but the persisted path bypasses that because it rehydrates BEFORE any conflict is observed.
There is no stored base-version on the persisted entry to detect the divergence.

### P5 — A concurrent edit silently nukes the ENTIRE undo stack — MEDIUM (trust)
Every `VERSION_CONFLICT` recovery funnels to `refreshComposition`, which clears `past` AND
`future` (3004-3005, comment at 3001-3003). One co-editor save (or one stale-tab save) and
the operator loses *all* their undo depth, including edits that never conflicted. The
trade-off is defensible (stale snapshots would mis-target), but it's harsh and undocumented
to the user — there's no toast like "history was reset because the page changed elsewhere."
For a tool that markets multi-editor, losing your whole undo stack on someone else's save is
a felt regression.

### P6 — Builder edits in the <750ms debounce window can be lost on a hard tab-kill — MEDIUM
`commitBuilderTreeMutation` sets `dirty=true` synchronously (so `beforeunload` *prompts*),
and `pagehide` calls `flushIfPending()` (2651-2666) — but that flush fires a **fire-and-
forget async server action** (`persistBuilderTree`), which `pagehide` cannot await. If the
tab is killed before the round-trip lands, the last pre-debounce builder edit is gone. The
localStorage flush only persists undo HISTORY, not the canonical draft, so it does not cover
this. Narrow window, but it's exactly the "did the editor eat my work?" failure the
inspector path was hardened against (`inspector-dock.tsx:529-544`).

### P7 — `composition` history captures slots+metadata but not the builderTree (fragile invariant) — LOW/MEDIUM
`currentSnapshot` (3084-3089) returns only `{ slots, metadata }`. A `composition` undo's
`restoreSnapshot` (5541) reconstructs the tree via
`reconcileBuilderTreeFromSlots(builderTreeRef.current, target.slots)` (5554) — i.e. it
reconciles the *current live* tree down to the snapshot's slots rather than restoring a
captured tree. This is correct ONLY while the invariant "slots fully determine the
section-mirror part of the tree, and freeform nodes are slot-independent" holds. It works
today, but it's an implicit coupling with no test (see P3) and is the kind of thing a future
freeform/section refactor breaks silently — a section-reorder undo could then mis-rebuild
freeform structure. Document the invariant or capture the tree in the snapshot.

### P8 — No `⌘Y` redo; redo lost on reload (minor parity gaps) — LOW
- Only `⌘⇧Z` redoes (`edit-shell.tsx:763`); Windows/AutoCAD users expect `⌘Y`/`Ctrl+Y` too.
- `future` is never persisted (only `past`, 2218-2250), so a reload silently drops all redo
  depth while keeping (partial) undo depth. Asymmetric and slightly surprising.

---

## What is genuinely solid (do NOT "fix")
- Uniform optimistic→CAS→rollback across all three kinds; failed replays roll the entry back
  onto its source stack (5663-5666, 5670-5673, 5676-5680, mirrored in redo).
- Multi-node ops are atomic single entries (5440, 5435-5444) — the half-revert bug is avoided.
- Debounce coalescing + queue ordering + burst-rollback math (4095-4131) is careful and
  correct for the in-session path.
- ⌘Z correctly yields to native text-undo inside inputs/contentEditable (edit-shell 626-634).
- Inspector field-save VERSION_CONFLICT recovery is the gold standard here: refetch, discard
  tail, leave the explanatory notice up ~3.5s rather than silently overwriting
  (`inspector-dock.tsx:529-549`).

---

## Recommended sequencing
These mostly touch the SAME core file (`edit-context.tsx`) and the SAME stacks, so they are
**largely sequential**, not parallel. Wave them:

1. **Wave A (seatbelt, do first):** P3 — stand up a real JSDOM + mocked-server-action harness
   for `EditProvider`; pin current behavior of `undo`/`redo` across all three kinds, mixed
   LIFO, burst rollback, persist/rehydrate, and VERSION_CONFLICT. No behavior change.
2. **Wave B (cheap, high-feel, after A is green):** P2 (selection on history entry) and P1
   (record history for visibility + rename). Both are additive to the same entry/dispatch
   sites; do together since they share the `dispatch`/`recordFieldEdit` plumbing.
3. **Wave C (correctness, after A):** P4 (stamp + check a base-version on persisted entries),
   P5 (surface a "history reset" toast, or scope the wipe), P6 (sendBeacon / keepalive draft
   on pagehide).
4. **Wave D (polish):** P7 (document/capture the tree invariant), P8 (⌘Y; optional redo
   persist).

Single-writer file means do NOT parallelize B/C/D across agents — they will collide on the
history stacks and the dispatch switch. A and the test harness can be built alongside.
