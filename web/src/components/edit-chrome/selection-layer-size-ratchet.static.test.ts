/**
 * selection-layer-size-ratchet.static.test.ts
 *
 * A line-count RATCHET for the builder's most contended files (row 5.4 of the
 * page-builder 8/10 program, `web/docs/page-builder-8of10-program-2026-08-05.md`).
 *
 * WHY A SEPARATE GUARD AT ALL
 * ───────────────────────────
 * The repo already caps file size with core `max-lines` @ 800 = error, but every
 * file that was already over 800 is grandfathered in `eslint-suppressions.json`
 * with `{"max-lines": {"count": 1}}`. A count of 1 is a count of 1 whether the
 * file is 801 lines or 8,001: once a file is on that list, eslint stops caring
 * how much further it grows. `selection-layer.tsx` reached 7,988 lines that way,
 * one small honest addition at a time, with every gate green the whole while.
 *
 * So this guard measures the thing eslint deliberately stopped measuring: the
 * actual line count, against a recorded budget.
 *
 * DIRECTION
 * ─────────
 * The ratchet only turns one way.
 *   • OVER budget  → fail. Adding lines to one of these files is a decision,
 *     not a default. If the addition is right, bump the budget in the SAME
 *     commit so the growth is reviewable in the diff instead of invisible.
 *   • WELL UNDER budget → fail too. After a real extraction the budget must be
 *     re-baselined, otherwise the slack quietly becomes headroom for the next
 *     regrowth and the ratchet stops ratcheting.
 *
 * LANE
 * ────
 * Lives in `src/components/edit-chrome/`, so `test:builder-chrome` picks it up
 * through `scripts/list-test-files.cjs` (recursive), and that lane runs in
 * `ci.yml`. `check:builder-test-lane-coverage` proves the membership rather than
 * trusting it.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/selection-layer-size-ratchet.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * How far under budget a file may sit before the ratchet demands a re-baseline.
 * Wide enough that ordinary churn inside a file does not thrash the number,
 * narrow enough that a real decomposition cannot leave hundreds of lines of
 * unclaimed headroom behind.
 */
const REBASELINE_SLACK = 60;

/**
 * file → maximum line count.
 *
 * Scoped to the two files row 5.4 owns. `edit-context.tsx`, `style-panel.tsx`,
 * `navigator-panel.tsx` and the rest of the edit-chrome god-file set are all
 * candidates for this map, and adding one is a single line here plus its
 * current `wc -l`. They are deliberately NOT enrolled in this commit: several
 * of them have concurrent in-flight work in this program, and a ratchet that
 * lands on top of open branches gets re-baselined out of spite rather than
 * respected.
 */
const BUDGETS: Record<string, number> = {
  // Row 5.4 baseline. 8,007 lines before the #908 nested-blocks panel came out.
  // +142 (canvas rotate/resize pack): rotation-handle wiring — commit callback,
  // rotated-overlay geometry in the rAF sync loop, context-menu Reset rotation.
  // The rotation MATH + component live in their own modules
  // (canvas-transform-geometry.ts, canvas-rotate-handle.tsx); this is the thin
  // wiring the guard's own procedure asks to be bumped visibly.
  // +16 (8-handle resize pack): commitSelectedNodeSize accepts the anchor-
  // compensation translate so a west/north resize commits as ONE undo step.
  // The resize math + component live in canvas-resize-geometry.ts /
  // canvas-resize-handles.tsx.
  // +216 (z-order commands): overlapping-sibling snapshot + ⌘]/⌘[ keyboard
  // branches + context-menu Bring/Send rows. The stacking MATH lives in
  // canvas-z-order.ts (unit-tested).
  // +10 (block-move auto-scroll): the hook call + import only. The rAF loop
  // itself was written inline first, tripped this guard at +59, and was
  // extracted to use-canvas-node-autoscroll.ts — which is the remedy this
  // guard asks for first. What remains here is the call site.
  // +7 (perf spine × z-order merge resolution): #1119's z-order shortcut
  // landed with an `if (saving) return;` guard; #1120 moved `saving` off the
  // context value, so the rebase produced code that referenced a name that no
  // longer existed — a CLEAN rebase that did not compile. The guard was
  // dropped rather than rewired, because #1120 removed that same gate from
  // every sibling node op (they ride the optimistic lane and CAS-reconcile
  // mid-save). This is the comment recording that decision; it is deliberately
  // longer than the line it replaced so the next reader does not have to
  // reconstruct why one command differs from its siblings.
  // MINUS (editor-chrome light unification): the bespoke dark
  // ContextMenuButton / ContextMenuSeparator moved to kit/menu-surface.tsx and
  // the dark-surface constants collapsed onto the shared kit values. This is
  // the ratchet moving DOWN, which is the direction it exists to encourage —
  // the budget below is the measured value after that extraction lands on top
  // of the rotate/resize/z-order growth itemised above.
  // +95 (anchored selection toolbar): the chip + multi-selection toolbar now
  // anchor to the selection bbox instead of docking to the viewport bottom.
  // ALL placement math (above/below flip, inside fallback, viewport +
  // occluder clamping, popup direction) lives in canvas-toolbar-anchor.ts
  // (unit-tested); what landed here is the thin wiring the guard's procedure
  // asks for: two positionAnchoredToolbarStack call sites inside the existing
  // rAF geometry loops (+ the union-bbox accumulation in the multi-ring
  // loop), one trigger-only-deps effect that re-primes the geometry flag when
  // a bar's CONTENT or a chrome occluder changes without a scroll/resize
  // signal, the chip's constant off-screen seed replacing its bottom-dock
  // style block, and the overflow menu's measured open-direction (the menu
  // could hardcode "up" only while the chip was pinned to the bottom edge).
  // +6 (quick-style popover, backlog item 1): ONE import + ONE render line
  // (plus its comment) in BlockChipToolBar for <QuickStyleChipButton/>. The
  // component, its popover, and ALL logic (field-per-kind gating,
  // device→bucket mapping, Mixed/lock resolution, patch shapes) live in
  // quick-style-popover.tsx + quick-style-logic.ts (unit-tested) — the
  // component reads selection/device/patch from context precisely so this
  // file's diff stays this thin.
  // +39 (builder-leftovers sweep, item 1 — breakpoint-aware nudge): the
  // responsive-bucket resolution, the next-style computation, and the
  // key-repeat acceleration curve all live in the new kit/nudge.ts (pure,
  // unit-tested); what's here is the handler wiring the guard's procedure
  // asks for — the nudge gate dropping its desktop-only clause (+ a comment
  // explaining why), a ref tracking consecutive OS key-repeats, the nudge
  // effect's onKeyUp listener + bucket-aware calls into
  // commitSelectedNodeTranslate/translateSelectedBuilderNodes, and that
  // commit fn's new optional `bucket` param + doc comment.
  // +13 (item 5 — toolbar re-clamp during a panel drag): subscribe to the new
  // `registerCanvasGeometryDirtyListener` context signal on mount so the
  // anchored toolbar re-primes its dirty flag while a floating panel is being
  // dragged. The publish side (the actual notify calls) lives in
  // floating-panel.tsx; the registry lives in use-workspace-panels.ts.
  // +18 (item 1 hotfix — live-QA #1146): a tablet nudge was committing a
  // top-level translate with no responsive.tablet bucket anywhere — `onNudge`
  // was reading the `device` variable closed over by the effect's last
  // (re-)subscription, which could go stale. Fixed with a `deviceRef` synced
  // in its own `useEffect` (never written during render — that trips
  // react-hooks/refs, already grandfathered exactly once in this file, at
  // scheduleRectRecomputeRef); `device` dropped from the nudge effect's own
  // deps since it no longer needs to re-subscribe for freshness.
  // Merge resolution (this PR over origin/main): both lanes grew this file and
  // both raised the budget. The additions are disjoint — main's quick-style
  // chip button (+6) and this branch's nudge/toolbar/device work (+66 over the
  // pre-lane 7687) — so the merged budget is the sum, 7753 + 6, and the file
  // measures exactly that. No re-baselining, no allowance beyond the two.
  // +36 (hover attribution): the blinking drag grip. The RESOLUTION — the
  // "declared owner beats DOM ancestry beats chrome bail" order, the section
  // twin, and the props helpers — lives in canvas-hover-attribution.ts and is
  // unit-tested there (including the oscillation itself). What landed in this
  // file is the wiring the guard's procedure asks for: two call sites in the
  // pointermove listener replacing their inline ancestry walks (net smaller),
  // one declaration each on the hover grip, the section control rail, the
  // canvas add/remove rail and the selection chip, and one wrapper element
  // (plus its comment) around the direct-manipulation handle group so the five
  // handles declare their owner once instead of five times.
  // MINUS 12 (SLIDER-4, the stuck selection border): the two rAF overlay
  //   tracking loops no longer inline their measure/write. `resolveOverlayBox`
  //   + `applyOverlayBox(es)` moved to selection-overlay-boxes.ts, WITH the fix
  //   that a target which can no longer be measured HIDES its overlay instead
  //   of keeping its last coordinates (the stuck ring). The rotated-geometry
  //   branch travelled with them and is unit-tested in
  //   selection-overlay-boxes.test.ts. Net: ~70 inline lines out, ~45 of
  //   wiring + the iframe self-detection gate + the explicit ring z-index back
  //   in. The ratchet moving DOWN,
  //   which is the direction it exists to encourage.
  // +80 (builder move affordances). Four wirings, each with its logic in a
  // module of its own exactly as this guard's procedure asks:
  //   • the on-hover grab handle became a rail (grip + click-to-move ↑/↓); the
  //     component is canvas-node-move-rail.tsx and the sibling-position lookup
  //     is findBuilderNodeParentIndex in replace-in-tree.ts. What is here is the
  //     one render site (which REPLACED the old inline <button>, so the net is
  //     smaller than the feature) plus a memo reading the hovered node's index.
  //   • "Reset size & position" on the block chip. Which style keys count as a
  //     layout escape, and the strip itself, live in layout-escapes.ts
  //     (unit-tested); here is the commit callback that also clears the inline
  //     previews the drag handles left on the live element, plus the button.
  //   • Move up/down promoted out of the overflow menu into visible chip
  //     buttons, matching the section chip. Two ChipBtns in, two menu rows and
  //     their prop plumbing out.
  //   • the #30 context menu now portals to <body> so it can outrank the
  //     Structure panel, which had to be raised above the canvas overlay to
  //     stop selection rings painting across it (see edit-shell.tsx).
  // Rebase resolution: both lanes moved this budget. Main's SLIDER-4 extraction
  // took it DOWN to 7783; this branch's move-affordance wiring adds +80 on top
  // of that, and the additions are disjoint. Budget below is the measured value
  // after the rebase, not the sum guessed in advance.
  // +6 (convert-to-component): pin `{ suggested, nodeId }` at menu-open so the
  // namer still converts the node the operator picked if selection changes
  // before they confirm the name.
  // +14 (nav-link focus): carrying the clicked LINK id alongside the selected
  // nav, because nav links are props rather than nodes so a click can only
  // select the whole nav. The DOM resolution was extracted to
  // `nav-submenu-pin.tsx` rather than inlined here; what remains is the
  // callback-ref wiring (three sites, by this file's own convention) and the
  // dispatch itself. Nothing left to extract without moving the click handler.
  // +34 (2026-08-20 canvas-affordance audit): keep the move rail mounted across
  // selection (showNodeMoveRail), gate + icon-ify the Add/Remove rail, and the
  // trash-icon SVG replacing the "Remove" text button.
  // +7 (2026-08-21): the move rail is no longer desktop-only — the phone canvas
  // had NO grab handle and no one-click reorder at all (owner report). The
  // comment explaining why carries most of those lines.
  // -76 (2026-08-27, "Unlock design"): ChipBtn and ChipTextAction moved to
  // chip-buttons.tsx alongside the new SectionUnlockChipButton, so the chip
  // primitives have one home and the section/block chips cannot drift apart.
  // Net of the unlock wiring the file is SMALLER; budget lowered to match.
  // -115 (2026-08-27, per-device canvas editing): the direct-manipulation
  // handles stopped being desktop-only and every box-model commit now has to
  // choose between the base style and `style.responsive[tier]`. Four commits
  // that had already drifted into four near-identical 40-line blocks became
  // one hook (use-canvas-box-model-commits.ts), the base/bucket routing became
  // a pure module (responsive-canvas-style.ts), and the chip's override badge
  // became its own component (responsive-override-badge.tsx). The feature came
  // out NET SMALLER than the code it replaced; budget lowered to match.
  // -25 (2026-08-27, "Restore original styling"): a section unlocked before
  // the eject-time baseline bake existed still renders stripped, and Relock
  // was the only exit — it restores the design by DELETING the blocks. The
  // non-destructive repair needed a second door on the section chip. Rather
  // than grow this file for it, the chip's Remove confirm (53 lines of inline
  // JSX) moved to chip-buttons.tsx as ChipRemoveConfirm, which more than paid
  // for the ~11 lines of wiring the new action needs here. The repair itself
  // is a pure module (section-eject-repair.ts) and its button lives in
  // chip-buttons.tsx; this file only picks the target. Budget lowered to match.
  // +24 (W5-B7 absolute drag-to-place): the grip writes top/left for
  //   position:absolute/fixed children. Snap + viewport patch live in
  //   canvas-move-place.ts (unit-tested). What landed here is the thin wiring:
  //   resolveMovePlacement, commitSelectedNodePlace, onCommitPlace, and
  //   clearing inset previews on layout reset. Translate commit clamp moved
  //   into the helper so this file does not grow by the full feature.
  // MINUS 98 (builder-2027 P1 / 1C): `collectCanvasDropCandidates` and
  //   `buildBuilderNodeMap` moved to canvas-drop-candidates.ts, where the drag
  //   hot path can be instrumented and unit-tested on its own
  //   (canvas-drop-candidates.perf.test.ts asserts the DOM-op counts). The
  //   rAF-coalesced scroll refresher added back a few wiring lines here. Net
  //   down, which is the direction this ratchet exists to encourage.
  "selection-layer.tsx": 7657,
  // The extracted panel. Also under the eslint 800 cap, and it must stay there:
  // the point of the extraction is a second small file, not a second god file.
  // +5 (PR #947): the `social_feed` case in `canvasChildSecondaryLabel`, which
  // names the network the feed pulls from rather than repeating "Social feed".
  // Still far under the eslint 800 cap.
  // +11 (SLIDER-3, "the panels are always behind"): the panel now portals
  //   ITSELF to <body> (both the collapsed pill and the open panel) instead of
  //   rendering inside #edit-overlay-portal, whose z-83 stacking context
  //   flattened this panel's z-91 and put it behind the inspector dock. That is
  //   two <PortaledOverlay> wrappers, two closing tags, the import, and the
  //   comment explaining the trap so the next person does not move it back.
  //   The z itself now comes from Z_INDEX.canvasPanels; no logic changed.
  // +7 (WS7 Phase 0): `canvasChildSecondaryLabel` switches EXHAUSTIVELY over
  //   BuilderNodeKind, so the two new native data kinds (`hero_search`,
  //   `talent_type_grid`) each need an arm or the file does not type-check.
  //   Kept to the shortest form that still names the data SOURCE, which is the
  //   one thing this label exists to say.
  "canvas-node-children-panel.tsx": 798,
};

function lineCount(relativePath: string): number {
  const source = readFileSync(resolve(THIS_DIR, relativePath), "utf8");
  // Match `wc -l` / eslint `max-lines`: count newline-terminated lines, and a
  // trailing partial line if the file does not end in a newline.
  const lines = source.split("\n");
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

for (const [relativePath, budget] of Object.entries(BUDGETS)) {
  test(`${relativePath} stays within its ${budget}-line budget`, () => {
    const actual = lineCount(relativePath);
    assert.ok(
      actual <= budget,
      `${relativePath} is ${actual} lines, over its recorded budget of ${budget} ` +
        `(+${actual - budget}). This file is on the size ratchet because it has ` +
        `already grown into a god file once. Either extract the new code into a ` +
        `module of its own, or raise the budget in ${"selection-layer-size-ratchet.static.test.ts"} ` +
        `in this same commit so the growth is visible in review.`,
    );
  });

  test(`${relativePath} budget is still tight`, () => {
    const actual = lineCount(relativePath);
    assert.ok(
      actual > budget - REBASELINE_SLACK,
      `${relativePath} is ${actual} lines but its budget is still ${budget}, ` +
        `leaving ${budget - actual} lines of unclaimed headroom. Lower the budget ` +
        `to ${actual} so the reduction is locked in. A ratchet with slack in it is ` +
        `just a comment.`,
    );
  });
}

test("the ratchet is measuring real files", () => {
  // Guards against the whole map silently becoming a no-op (a renamed file
  // would otherwise throw ENOENT inside one test and read as one unrelated
  // failure; an emptied map would read as green).
  const entries = Object.entries(BUDGETS);
  assert.ok(entries.length > 0, "BUDGETS is empty: the ratchet guards nothing.");
  for (const [relativePath] of entries) {
    assert.ok(
      lineCount(relativePath) > 0,
      `${relativePath} is empty or missing; the ratchet entry is stale.`,
    );
  }
});
