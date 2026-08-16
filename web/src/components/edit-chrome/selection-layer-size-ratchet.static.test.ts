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
  "selection-layer.tsx": 7759,
  // The extracted panel. Also under the eslint 800 cap, and it must stay there:
  // the point of the extraction is a second small file, not a second god file.
  // +5 (PR #947): the `social_feed` case in `canvasChildSecondaryLabel`, which
  // names the network the feed pulls from rather than repeating "Social feed".
  // Still far under the eslint 800 cap.
  "canvas-node-children-panel.tsx": 778,
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
