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
