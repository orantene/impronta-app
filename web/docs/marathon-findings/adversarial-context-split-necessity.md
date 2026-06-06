# Adversarial challenge — is the full edit-context split ("Sub-step E") NECESSARY?

**Area key:** `adversarial-context-split-necessity`
**Worktree:** `/Users/oranpersonal/Desktop/impronta-builder-marathon`
**Target file:** `web/src/components/edit-chrome/edit-context.tsx` (6,437 lines)
**Date:** 2026-06-05
**Stance:** default-skeptical. I tried to PROVE the split is unavoidable. It is not.

---

## Claim under challenge

> The full `edit-context.tsx` decomposition ("Sub-step E" / GATE-C: `EditActionsContext` vs `EditStateContext`) is **necessary** to hit instant paint. The cheap re-render wins alone cannot get there.

**Verdict: the claim does NOT hold.** The cheap wins (CW-1 canvas options memo + CW-2 hover micro-store + CW-3 dirty/selection micro-store), PLUS one ~4-line ref fix I surface below, are sufficient to remove every whole-editor re-render on the hot paths (hover, select, drawer toggle, commit). The structural 2-context split is a defensible *later polish* but is **not on the critical path to "feels like a program."** `holds=false`.

---

## The one real wedge I found (and why it does NOT force a split)

The plan's GATE-C rests on a single load-bearing premise: *"the action callbacks are already `useCallback`-stable, so once hover + dirty/selection leave the value object, an action-only consumer has nothing left to churn on."* If that premise were false, removing hover/dirty/selection from the value would NOT stop the value from churning, and an action-only consumer (e.g. `instance-overrides-panel` reading only `setInstanceOverride`) would still re-render on every edit — which would re-open the case for the split.

I went looking for a callback whose identity changes on a hot path. **I found one chain that does:**

- `executeBuilderNodeOperation` (`edit-context.tsx:4201-4282`) lists **`selectedBuilderNodeId` and `selectedSectionId` in its deps** (lines 4279-4280) — purely to stamp the audit-event annotation (`activeSelectionSectionId`/`activeSelectionNodeId`, lines 4262-4263).
- **~22 tree-mutating callbacks depend on `executeBuilderNodeOperation`** (`setInstanceOverride`, `insertBuilderNode`, `moveBuilderNodeToIndex`, `removeBuilderNode`, `patchBuilderNodeProps`, `patchSelectedBuilderNodesStyle`, `applyInstanceVariant`, … — grep: 22 `[executeBuilderNodeOperation]` dep entries between lines 4419-5515).

**Consequence:** every **selection change** recreates `executeBuilderNodeOperation` → recreates all ~22 action callbacks → forces a new `value` identity **even if `selectedSectionId` were notionally "moved to a store."** So naive CW-3 (move selection out of the value) would NOT fully quiet action-only consumers — selection churn would leak back in through the action callbacks. This is the strongest pro-split argument available, and the plan does not call it out explicitly.

### Why it still does NOT justify the structural split

The wedge is **closable with the exact cheap ref-pattern the file already uses**, not a context split:

- The commit core already reads the tree via a **ref**, not state: `commitBuilderTreeMutation` uses `builderTreeRef.current` (`:4143`) and therefore deps only `[capHistory, queueRouterRefresh]` (`:4198`) — it does NOT re-create on every `builderTree` change. The file establishes `builderTreeRef` (`:2107`) and `pageVersionRef` (`:2104`) precisely to keep hot callbacks stable.
- Selection is simply **not yet mirrored to a ref**. Add `selectedSectionIdRef` / `selectedBuilderNodeIdRef` (two `useRef` + an effect to sync, ~4 lines, mirroring `builderTreeRef`), read them in the audit annotation, and **drop `selectedSectionId`/`selectedBuilderNodeId` from `executeBuilderNodeOperation`'s dep array.** Then `executeBuilderNodeOperation` becomes selection-stable, all 22 action callbacks become selection-stable, and CW-3 actually delivers: selection churn no longer reaches action-only consumers.

That is a surgical, single-writer, low-risk edit in the SAME class as CW-1/CW-2/CW-3 — not the 122-field, 38-consumer, autosave/undo/CAS-coupled "riskiest refactor in the builder" that GATE-C describes. **The wedge sharpens the cheap-wins plan; it does not earn the split.** (Recommend folding this ref fix into W2-T4 — call it W2-T4a — and asserting it with the render-count probe: a click must not re-render an action-only consumer.)

---

## Everything else I checked to find a forcing-function — all clean

I audited every other way the `value` object could churn on a non-mutating path (which would defeat cheap-wins-only). None of them forces a split:

| Potential forcing-function | Finding | Verdict |
|---|---|---|
| **Action callbacks unstable on render** | All grep'd action callbacks are `useCallback`-wrapped (`insertSection :3622`, `removeSection :3732`, `moveSection :3935`, `moveBuilderNodeToIndex :4304`, `insertBuilderNode :4386`, `patchBuilderNodeProps :5115`, `removeBuilderNode :4828`, `undo :5644`, `redo :5692`, `recordFieldEdit :5745`, drawer opens, `saveDraft :5976`, `flushBuilderTreeSave :4095`, …). | Stable. No churn. |
| **The shared commit core re-creates on tree change** | `commitBuilderTreeMutation` reads `builderTreeRef.current` and deps `[capHistory, queueRouterRefresh]` (`:4198`); `capHistory` deps `[]` (`:2215`); `queueRouterRefresh` is a `useCallback`. So a tree mutation does NOT recreate the commit core. | Stable. By design. |
| **Per-render inline allocations inside the value** | Grep of the value body (`:6032-6238`) for inline `{`/`[`/ternary non-primitives: the only computed fields are `copiedBuilderNodeKind` (string ternary), `canUndo`/`canRedo` (booleans), `workspaceMembershipSlug` (string trim) — all **primitives**, no new object/array identity per render. | No hidden churn. |
| **Set-typed deps (`additionalSelectedIds`, multi-select) reallocate each render** | They are `useState`-backed and every updater preserves identity on no-op (`prev.size === 0 ? prev : new Set()`, e.g. `:1899-1902`, `:2024-2026`). New `Set` only on a real selection-set change. | No per-render churn. |
| **Typing churns the value per keystroke (would re-render everyone constantly)** | `setDraftProps` fires inside `commitText` on **commit/blur**, guarded by `next === original` (`inline-editor.tsx:135,154`), NOT per keystroke. Text lives in the contentEditable buffer until commit. `setDraftProps` itself deps `[]` (`:2043`). | Per-COMMIT, not per-keystroke. The value rebuild on a text edit is once-per-blur. |
| **`recordFieldEdit` churns on edit** | deps `[capHistory]` only (`:5763`); `capHistory` is `[]`-stable. | Stable. |
| **`selectedBuilderNodeId` is a fresh memo each render** | `useMemo` over `[selectedSectionId, selectedBuilderNodeIdOverride, builderTree, …]` (`:2802-2817`) — recomputes only when those change, returns a stable string id otherwise. | Recomputes on real selection/tree change only. |

The net: outside the selection→`executeBuilderNodeOperation` wedge above, **there is no path on which the `value` object gets a new identity without a state change that genuinely warrants a re-render** (a real mutation, a drawer toggle, a save-state flip). Hover and selection are the only *high-frequency* offenders, and both are addressed by CW-2/CW-3 + the ref fix.

---

## What "cheap wins alone" actually achieves (the honest ceiling)

After CW-1 (canvas options memo, `client-builder-canvas.tsx:101` → `render.tsx:3200-3212`), CW-2 (hover micro-store, removes `hoveredSectionId`/`hoveredBuilderNodeId` from value deps `:6280-6281`), CW-3 (dirty + selection micro-store), and the **selection-ref fix** (closes the `executeBuilderNodeOperation` wedge):

- **1-char edit (I1):** repaints only the changed subtree (CW-1 lets the `Object.is(prev.node)` memo half bail). Instant.
- **Hover boundary (I4):** re-renders ~5 hover readers, not 41. Flat.
- **Click / select:** re-renders the selection readers + inspector load; action-only consumers stay quiet *because the selection-ref fix kept the action callbacks stable*. No whole-editor churn.
- **Drawer toggle:** rebuilds the value (the drawer booleans are still in it) → re-renders consumers. **This is the ONE residual whole-editor re-render cheap-wins-only leaves.** But it fires on an explicit, low-frequency, user-initiated action (open Theme/Assets/Publish), the work is cheap (the heavy canvas subtree is memo-stable post-CW-1, so it bails), and it is NOT a paint-latency-on-edit problem. It does not block "instant paint."

That residual drawer-toggle re-render is the ENTIRE remaining surface the structural split would buy down. It is a *Clean/elegance* improvement, not a *Fast/instant-paint* requirement.

---

## Where the split WOULD legitimately earn its place (and why that's not "necessary")

The bounded 2-context split (CW-4 / GATE-C) genuinely helps exactly one cohort: the **~20 action-only / UI-only / STATIC-only consumers** (e.g. `shortcut-overlay.tsx` reads only `{canEditSiteShell,pageSlug}`; `theme-drawer.tsx` reads only `{themeOpen,closeTheme,queueRouterRefresh}`; `instance-overrides-panel` reads only `setInstanceOverride`). After the cheap wins, these still re-render on a drawer toggle and on a real mutation's `builderTree`/`slots`/`dirty` flip — even though they don't read those fields. Splitting `value` into a stable-actions context + a volatile-state context (or, cheaper still, `React.memo` on those leaves per the doc's Win B) stops that.

But note the two facts that demote this from "necessary" to "optional polish":
1. **It is a Clean/correctness win, not a Fast win.** The instant-paint bar (canvas repaint on edit; flat hover/select) is met without it.
2. **There is a cheaper substitute already on the plan:** `React.memo` the ~10 cheap leaf consumers (Win B, `context-split-risk-map.md §4`). After the selection-ref fix removes the action-callback churn, `React.memo` on a leaf that reads only stable fields makes it re-render essentially never — capturing most of the split's benefit at S effort and near-zero risk, with no 38-consumer blast radius.

So even the cohort the split is designed for has a cheaper path. The structural split is the *last* tool to reach for, gated by a real flamegraph, exactly as the plan's §3 says.

---

## Bottom line

- **Does the full split hit a wall the cheap wins can't?** No. The single non-obvious churn path (selection → `executeBuilderNodeOperation` → 22 action callbacks) is real and the plan under-documents it, but it is closed by a ~4-line ref mirror (the pattern already used for `builderTreeRef`/`pageVersionRef`), not by decomposing the context.
- **Is the split therefore necessary?** No. It is an optional, measurement-gated Clean polish whose one beneficiary cohort (action/UI/STATIC-only consumers) is also served, more cheaply, by `React.memo` on the leaves.
- **Recommended correction to the plan:** add the **selection-ref fix to W2-T4** (so CW-3 actually delivers selection-quiet action consumers), keep GATE-C as written but lower its expected probability to ~nil, and prefer **Win B (`React.memo` leaves)** over the structural split if GATE-B ever returns NO-GO.

`holds = false` — the split is genuinely avoidable.
