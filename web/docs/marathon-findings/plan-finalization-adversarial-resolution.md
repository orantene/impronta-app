# Plan finalization — adversarial verdict resolution (2026-06-05)

**Area key:** `plan-finalization-adversarial-resolution`
**Target:** `web/docs/builder-marathon-plan-2026-06-05.md`
**Worktree:** `/Users/oranpersonal/Desktop/impronta-builder-marathon`

Three adversarial reviews were run against the plan; all three `holds=false` (i.e. the plan's original claim was wrong, the challenge is correct). Every correction was re-verified against the live source before folding into the plan. This file records what was verified and what changed.

---

## Verdict 1 — Context split necessity (`holds:false` → split NOT necessary)

**Verified at source:**
- `executeBuilderNodeOperation` (`edit-context.tsx:4201-4282`) deps `selectedBuilderNodeId`+`selectedSectionId` at `:4279-4280`, used ONLY at `:4262-4263` for the audit annotation.
- `executeBuilderNodeOperation` is referenced by **54 call-sites** (grep) — even more than the verdict's "~22", strengthening the case: selection-stabilizing this one callback is very high leverage.
- `commitBuilderTreeMutation` already reads the tree via `builderTreeRef.current` (`:4143`) → deps `[capHistory, queueRouterRefresh]` (`:4198`). The ref-pattern is established: `pageVersionRef` (`:2104`), `builderTreeRef` (`:2107`).
- `selectedSectionIdRef`/`selectedBuilderNodeIdRef` do NOT exist yet → the ~4-line add is net-new and correct.
- Value-memo deps (`:6239-6420`) contain `hoveredSectionId`/`hoveredBuilderNodeId` at `:6280-6281`. Value body (`:6032-6238`) has no per-render inline object/array allocations.

**Plan changes:**
- Added **W2-T4a** (selection-ref fix) as a distinct task before W2-T4 in the edit-context serialize chain.
- Inserted W2-T4a into the §3 "cheap wins" list as step 3 (the load-bearing addition).
- GATE-C: expected trigger probability lowered to ≈ nil; if GATE-B ever returns NO-GO, **prefer `React.memo` on the ~10 leaf consumers over the structural split**. §6 deferred row updated to match.
- DECISIONS section D1 documents the wedge + its closure.

---

## Verdict 2 — Seatbelt path defect (`holds:false` → seatbelt has a fatal path defect)

**Verified at source:**
- `vitest.config.mts` `test.include = ["test/**/*.test.tsx"]` → only `web/test/**` is collected. **0** `.test.tsx` files under `web/src`.
- An EditProvider smoke test ALREADY EXISTS at `web/test/components/edit-chrome/edit-context.test.tsx` (3 assertions) — W0-T2's prescribed `src/`-rooted path both (a) would be silently skipped and (b) name-collides with the real file.
- `tsx --test` runs `src/**.test.ts` with no jsdom → cannot render `EditProvider`.
- **Orphan-set wording correction CONFIRMED:** `builder-node-editor-published-parity`, `builder-node-undo-transaction`, `render.test`, `render-output`, `node-presentation*` are ALL already referenced in `package.json` (in `test:builder-node-bindings` / `test:node-presentation`). Only **6** builder-chrome files are truly orphaned: `style-classes`, `multi-node-selection`, `multi-node-transforms`, `canvas-align-guides`, `section-eject`, `visibility-render`. (For the record: 140 `*.test.ts(x)` files under `src` are unreferenced overall.)
- **Client-canvas runtime hazard CONFIRMED:** `ClientBuilderCanvas` reads the tree from the bridge via `useSyncExternalStore` (`client-builder-canvas.tsx:94-99`), but `dataSources`/`sectionEmbedIslands`/`components` arrive as props re-identified per server render (`:101`). `grep` → **0** test files reference `client-builder-canvas` / `publishBuilderCanvasTree` / `subscribeBuilderCanvasTree`. A custom `React.memo` comparator omitting those props would break the published-island repaint on the server-refresh path.
- `hasLiveData` mistag risk is real (W2-T2 correctness depends on exact 9-vs-37 tagging).
- W4-T4(b) is the point of no return for the server-canvas fallback.

**Plan changes:**
- W0-T1 scope corrected to the **6** genuinely-orphaned builder-chrome files; explicit "do NOT re-wire the already-wired tests."
- W0-T2/T3/T4 **retargeted** to `web/test/components/edit-chrome/*.test.tsx`; W0-T2 now EXTENDS the existing file.
- New **W0-T3b** = client-canvas re-render contract test; made a HARD dep of W2-T1 (replaces the mistargeted W0-T3 dep for runtime protection). W2-T1 gains an explicit "no custom comparator" rule.
- New **W0-T5(d)** = `section-meta-live-data.test.ts` asserting `hasLiveData:true` for every section with a server data-loader; made the dep of W2-T2.
- New **W0-T8** = seatbelt-execution exit gate (revert-must-fail proof + `verify:seatbelt-executes`); **Wave 1 is hard-fenced behind it.**
- W4-T4(b) now requires BOTH a prod-cycle flag-ON AND the W0-T7 flag-OFF/ON delta capture before deleting the fallback.
- DECISIONS D2 + D3 + Risks 1/2/3 document all of the above.

---

## Verdict 3 — Parallel collision audit (`holds:false` → 5 hidden collisions)

**Verified at source:**
1. **W3-T1 context edit missing from chain:** `lastInsertedNodeId` does NOT exist in `edit-context.tsx` → W3-T1's highlight half is a real provider edit, contending with W3-T2/W3-T8.
2. **W0-T6 touches shared-core:** the plan's fallback prescribed probes in `edit-context.tsx:6032` + `render.tsx:3196` (`renderBuilderNodes` confirmed at `:3196`, memo at `:3193`, `normalizedOptions` at `:3200`).
3. **edit-shell.tsx same-file regions:** `MutationErrorToast` at `:1353` (W3-T2) vs `FirstPaintTip` at `:1174`/`:1080` (W6-T2) — ~270 lines apart, "DISJOINT" is misleading.
4. **navigator-panel hover is LOCAL:** `useState` at `:314`, setters `:2331`/`:2350`; reads non-hover context at `:275`; never consumes `hoveredSectionId` from context. The real W2-T3 hover consumers (verified by grep): `selection-layer.tsx` (30 refs), `freeform-layers-tree.tsx` (2), `iframe-bridge.tsx` (6), `edit-shell.tsx` (3).
5. **client-builder-canvas.tsx:101 three-way:** the single `renderBuilderNodes` call; W1-T2 threads `styleClasses` there, W2-T1 wraps options in `useMemo` there — same line.

**Plan changes:**
- W3-T1 row split into render-half (render.tsx chain) + context-half (`lastInsertedNodeId`, joins edit-context chain). §4 edit-context chain updated to include it.
- W0-T6 refactored to a NEW standalone `builder-profiler.ts` + mount-point Profilers only; explicit "no diff in edit-context.tsx or render.tsx." §4 render/edit-context chains note this.
- §4 "GENUINELY DISJOINT" Wave-6 caveat added for edit-shell.tsx hunk coordination with W3-T2/W2-T3.
- W2-T3 reader list reduced to the 4 real consumers; explicit "do NOT touch navigator-panel."
- Cross-lane hazards table gains the client-canvas:101 three-way (W1-T2 before W2-T1 on that line) and the navigator-panel "not a risk, just stop chasing it" note.

---

## Net effect on the plan

- **Context-split decision is now pre-made and defended:** do NOT split; W2-T4a + React.memo-leaves are the path. GATE-C kept as a near-zero-probability escape hatch.
- **The seatbelt actually works now:** correct paths + W0-T8 execution proof + Wave-1 fence. This was the single highest-severity defect (false-green CI enabling unguarded surgery on a 6,437-LOC file).
- **Sequencing is collision-free:** W3-T1 context half, client-canvas:101, edit-shell regions, and the profiler-off-shared-core all resolved.
- Landing target unchanged (~93 weighted); the corrections are about *not shipping a regression while getting there*, not about scope.
