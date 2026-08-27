/**
 * mobile-fix.test.ts — W3-M3 one-click "Fix mobile issues" resolver.
 *
 * The load-bearing property: the fix composes with the W3-M1 publish gate.
 * A page that a fixed-width overflow BLOCKS from publishing must, after the
 * one-click fix, no longer overflow, so the M1 publish block clears. The batch
 * apply folds every fix into ONE tree (one undoable transaction), never touches
 * the desktop/base style, and no-ops cleanly when already responsive.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectBuilderTreeLayoutFindings,
  isBlockingLayoutFindingId,
} from "./layout-health";
import { collectMobileFixes, applyMobileFixes } from "./mobile-fix";
import {
  MOBILE_VIEWPORT_MAX_PX,
  collectMobileOverflowOffenders,
} from "./mobile-health";
import type { BuilderContainerNode, BuilderNodeTree } from "./types";

/** A container baked at a fixed width wider than the mobile viewport (the live
 *  `width:1120px`-in-390px case M1 promotes to a publish blocker). */
function fixedWidthOverflowTree(px = MOBILE_VIEWPORT_MAX_PX + 730): BuilderNodeTree {
  const container: BuilderContainerNode = {
    id: "wide1",
    kind: "container",
    props: { layout: "stack", style: { width: `${px}px` } },
    children: [],
  };
  return [container];
}

test("a fixed-width overflow tree is detected as an M1 publish blocker", () => {
  const tree = fixedWidthOverflowTree(1120);
  const offenders = collectMobileOverflowOffenders(tree);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0]!.nodeId, "wide1");
});

test("collectMobileFixes offers exactly one overflow_width fix for it", () => {
  const tree = fixedWidthOverflowTree(1120);
  const fixes = collectMobileFixes(tree);
  const overflowFixes = fixes.filter((f) => f.kind === "overflow_width");
  assert.equal(overflowFixes.length, 1);
  assert.equal(overflowFixes[0]!.nodeId, "wide1");
});

test("COMPOSE WITH M1: apply the fix and the overflow (and the publish block) clears", () => {
  const tree = fixedWidthOverflowTree(1120);
  // Precondition: it blocks publish.
  assert.ok(collectMobileOverflowOffenders(tree).length > 0);

  const result = applyMobileFixes(tree);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.appliedCount >= 1);

  // Postcondition: the fixed tree no longer overflows, so the M1 gate unblocks.
  assert.equal(
    collectMobileOverflowOffenders(result.tree).length,
    0,
    "after the one-click fix the page must no longer overflow on mobile",
  );
});

test("the fix does NOT change the desktop/base width, only the mobile override", () => {
  const tree = fixedWidthOverflowTree(1120);
  const result = applyMobileFixes(tree);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const fixed = result.tree[0] as BuilderContainerNode;
  const style = fixed.props.style as Record<string, unknown> & {
    responsive?: { mobile?: Record<string, unknown> };
  };
  // Base width is untouched (desktop still renders exactly as before).
  assert.equal(style.width, "1120px");
  // The clamp lives on the mobile breakpoint override.
  const mobile = style.responsive?.mobile as Record<string, unknown> | undefined;
  assert.ok(mobile, "a mobile-breakpoint override must be written");
});

/** A 2-column grid with no mobile stack rule: the `container-mobile-stack`
 *  PUBLISH BLOCKER, which the soft mobile-health advisory ignores (it only
 *  fires at 3+ columns). The one-click fix must reach it anyway. */
function twoColumnBlockerTree(): BuilderNodeTree {
  const container: BuilderContainerNode = {
    id: "grid2",
    kind: "container",
    props: { layout: "grid", columns: 2 },
    children: [],
  };
  return [container];
}

test("COMPOSE WITH THE LAYOUT GATE: blocking layout findings are one-click fixable", () => {
  const tree = twoColumnBlockerTree();
  // Precondition: the layout linter blocks publish on this tree.
  const blocking = collectBuilderTreeLayoutFindings(tree).filter((f) =>
    isBlockingLayoutFindingId(f.id),
  );
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0]!.id, "container-mobile-stack");

  // The fix resolver picks it up (as container_stack, via the quickFixPatch).
  const fixes = collectMobileFixes(tree);
  assert.equal(
    fixes.filter((f) => f.nodeId === "grid2").length,
    1,
    "exactly one fix per node — never a duplicate from the two linters",
  );

  // Postcondition: after applying, no blocking layout finding remains.
  const result = applyMobileFixes(tree);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.appliedCount >= 1);
  const stillBlocking = collectBuilderTreeLayoutFindings(result.tree).filter(
    (f) => isBlockingLayoutFindingId(f.id),
  );
  assert.equal(
    stillBlocking.length,
    0,
    "after the one-click fix the layout publish blockers must clear",
  );
});

test("REGRESSION: a mobile bucket that already carries columns still stacks", () => {
  // The live Impronta homepage shape. Every grid on it carried
  // `mobile: { gap: "s", layout: "grid", columns: 2 }`. The old patch set
  // `layout: "stack"` while preserving `columns: 2`, which the tree validator
  // rejects ("stack layout must use exactly 1 column") — so applyMobileFixes
  // dropped the fix and the publish blocker survived the click.
  const tree: BuilderNodeTree = [
    {
      id: "rb-home-divisions-grid",
      kind: "container",
      props: {
        layout: "grid",
        columns: 3,
        responsive: {
          mobile: { gap: "s", layout: "grid", columns: 2 },
          tablet: { columns: 2 },
        },
      },
      children: [],
    } satisfies BuilderContainerNode,
  ];

  assert.equal(
    collectBuilderTreeLayoutFindings(tree).filter((f) =>
      isBlockingLayoutFindingId(f.id),
    ).length,
    1,
    "precondition: this shape blocks publish",
  );

  const result = applyMobileFixes(tree);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.appliedCount, 1, "the fix must actually apply, not be dropped as invalid");
  assert.equal(
    collectBuilderTreeLayoutFindings(result.tree).filter((f) =>
      isBlockingLayoutFindingId(f.id),
    ).length,
    0,
    "after the click the publish blocker must be gone",
  );

  // The tablet override and the mobile gap survive; only layout+columns move.
  const fixed = result.tree[0] as BuilderContainerNode;
  const responsive = fixed.props.responsive as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(responsive.mobile?.layout, "stack");
  assert.equal(responsive.mobile?.columns, 1);
  assert.equal(responsive.mobile?.gap, "s");
  assert.equal(responsive.tablet?.columns, 2);
  assert.equal(fixed.props.columns, 3, "desktop columns untouched");
});

test("a 3-column grid flagged by BOTH linters still collects only one fix", () => {
  const tree: BuilderNodeTree = [
    {
      id: "grid3",
      kind: "container",
      props: { layout: "grid", columns: 3 },
      children: [],
    } satisfies BuilderContainerNode,
  ];
  const fixes = collectMobileFixes(tree).filter((f) => f.nodeId === "grid3");
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0]!.kind, "container_stack");
});

test("applying to an already-responsive tree is a clean no-op", () => {
  const tree: BuilderNodeTree = [
    {
      id: "ok1",
      kind: "container",
      props: { layout: "stack", style: { width: "100%" } },
      children: [],
    } satisfies BuilderContainerNode,
  ];
  assert.equal(collectMobileFixes(tree).length, 0);
  const result = applyMobileFixes(tree);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.appliedCount, 0);
  assert.equal(result.tree, tree); // same reference: no history entry recorded
});
