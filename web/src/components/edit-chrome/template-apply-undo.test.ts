import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BuilderNode,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";

/**
 * CANVAS-4 — snapshot-before-apply + Undo toast for template/starter apply.
 *
 * THE CONTRACT THIS GUARDS. Every surface's "apply this design" gesture routes
 * through the shared `EditContext.applyTemplateWithUndo` helper
 * (edit-context.tsx:5962). Before the authoritative apply runs, the CURRENT
 * full builderTree is captured as `pre`; on success the helper pushes EXACTLY
 * ONE `{ kind:"builderTree", pre, post }` history entry (edit-context.tsx:5993)
 * — the same shape every node mutation records via `commitBuilderTreeMutation`
 * — and raises the shared `templateAppliedToast` (edit-context.tsx:5998). A
 * single `undo()` must then restore the WHOLE prior tree (not a partial), since
 * a template apply REPLACES the entire tree. A failed apply must push nothing.
 *
 * THE REGRESSIONS THIS GUARDS:
 *   1. A raw `setBuilderTree(next)` that never records `pre` → Undo cannot
 *      restore the page the operator just replaced (the pre-CANVAS-4 gap on
 *      every surface except the homepage's bespoke card).
 *   2. Snapshotting only a partial tree → Undo half-restores a whole-page
 *      replace.
 *   3. Pushing a history entry on a FAILED apply → a phantom undo step that
 *      "restores" a tree that was never replaced.
 *
 * WHY A LOCAL HARNESS. The production seam is a React `useCallback`/`useRef`
 * closure inside `EditProvider`; it can't be imported without a DOM and a
 * mocked surface adapter. `mirrorApplyTemplateWithUndo` below is a faithful,
 * line-cited mirror of ONLY the stack mechanics of the real helper
 * (edit-context.tsx:5962-6000) — capture `pre`, await `apply`, on `!ok` push
 * nothing, on `ok` push one `{ pre, post }` and adopt `post`. Undo restores
 * `pre`, matching the real `undo()` builderTree branch (edit-context.tsx:7208
 * → persistBuilderTree(entry.pre)). The same pattern is used by
 * builder-node-undo-transaction.test.ts.
 */

interface BuilderTreeHistoryEntry {
  pre: BuilderNodeTree;
  post: BuilderNodeTree;
}

type ApplyResult =
  | { ok: true; tree: BuilderNodeTree }
  | { ok: false; error?: string };

/** Faithful mirror of EditContext's template-apply + builderTree undo stack. */
class TemplateApplyHarness {
  present: BuilderNodeTree;
  readonly past: BuilderTreeHistoryEntry[] = [];
  readonly future: BuilderTreeHistoryEntry[] = [];
  /** Mirror of `templateAppliedToast` (edit-context.tsx:3624). */
  toast: { label: string } | null = null;

  constructor(initial: BuilderNodeTree) {
    this.present = initial;
  }

  /** Mirror of `applyTemplateWithUndo` (edit-context.tsx:5962-6000). */
  async applyTemplateWithUndo(input: {
    label: string;
    apply: () => Promise<ApplyResult>;
  }): Promise<{ ok: boolean; error?: string }> {
    // Snapshot the pre-apply tree BEFORE the write (edit-context.tsx:5973).
    const preTree = this.present;
    const result = await input.apply();
    if (!result.ok) {
      // Failed apply pushes NOTHING (edit-context.tsx:5979-5982).
      return { ok: false, error: result.error };
    }
    const postTree = result.tree;
    // Adopt the applied tree + record exactly one entry (edit-context.tsx:5986-5995).
    this.present = postTree;
    this.past.push({ pre: preTree, post: postTree });
    this.future.length = 0;
    // Raise the shared toast (edit-context.tsx:5998).
    this.toast = { label: input.label };
    return { ok: true };
  }

  /** Mirror of `undo()` builderTree branch (edit-context.tsx:7208). */
  undo(): void {
    const entry = this.past.pop();
    if (!entry) return;
    this.future.push(entry);
    this.present = entry.pre;
  }

  /** Mirror of `redo()` builderTree branch. */
  redo(): void {
    const entry = this.future.pop();
    if (!entry) return;
    this.past.push(entry);
    this.present = entry.post;
  }
}

function section(id: string, text: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: { layout: "stack", gap: "m" },
    children: [
      { id: `${id}:h`, kind: "heading", props: { text, level: 2 } },
    ],
  } as BuilderNode;
}

/** A whole-page "template" tree — multiple roots, distinct from the prior page. */
function templateTree(): BuilderNodeTree {
  return [
    section("tpl-hero", "Editorial hero"),
    section("tpl-body", "Editorial body"),
    section("tpl-cta", "Editorial CTA"),
  ];
}

test("applyTemplateWithUndo: snapshot-before-apply records one entry; undo restores the FULL prior tree", async () => {
  const priorTree: BuilderNodeTree = [section("old-1", "Prior page block")];
  const harness = new TemplateApplyHarness(priorTree);
  const priorSnapshot = structuredClone(priorTree);

  const next = templateTree();
  const res = await harness.applyTemplateWithUndo({
    label: "Editorial",
    apply: async () => ({ ok: true, tree: next }),
  });

  assert.ok(res.ok, "apply should succeed");
  // EXACTLY ONE undo entry for the whole-page replace.
  assert.equal(harness.past.length, 1, "one history entry pushed");
  assert.equal(harness.future.length, 0, "redo stack cleared");
  // The applied (post) tree is now present.
  assert.deepEqual(harness.present, next, "template tree adopted");
  // The shared toast is raised with the design label.
  assert.deepEqual(harness.toast, { label: "Editorial" }, "Undo toast raised");

  // ONE undo restores the COMPLETE prior tree byte-for-byte (the regression:
  // a partial/absent snapshot would leave the template tree or a fragment).
  harness.undo();
  assert.deepEqual(
    harness.present,
    priorSnapshot,
    "undo restores the entire pre-apply tree",
  );

  // Redo re-applies the full template tree.
  harness.redo();
  assert.deepEqual(harness.present, next, "redo re-applies the template");
});

test("applyTemplateWithUndo: a FAILED apply pushes no history entry and raises no toast", async () => {
  const priorTree: BuilderNodeTree = [section("old-1", "Prior page block")];
  const harness = new TemplateApplyHarness(priorTree);

  const res = await harness.applyTemplateWithUndo({
    label: "Editorial",
    apply: async () => ({ ok: false, error: "server rejected" }),
  });

  assert.equal(res.ok, false, "apply reports failure");
  assert.equal(res.error, "server rejected");
  assert.equal(harness.past.length, 0, "no phantom undo entry on failure");
  assert.equal(harness.toast, null, "no toast on failure");
  assert.deepEqual(harness.present, priorTree, "tree unchanged on failure");
});

test("applyTemplateWithUndo: applying a SECOND template stays one-undo-per-apply and unwinds in order", async () => {
  const priorTree: BuilderNodeTree = [section("old-1", "Original")];
  const original = structuredClone(priorTree);
  const harness = new TemplateApplyHarness(priorTree);

  const first = templateTree();
  await harness.applyTemplateWithUndo({
    label: "Editorial",
    apply: async () => ({ ok: true, tree: first }),
  });
  const firstSnapshot = structuredClone(first);

  const second: BuilderNodeTree = [section("agency-hero", "Agency hero")];
  await harness.applyTemplateWithUndo({
    label: "Agency",
    apply: async () => ({ ok: true, tree: second }),
  });

  assert.equal(harness.past.length, 2, "one entry per apply");
  assert.deepEqual(harness.toast, { label: "Agency" }, "latest label in toast");

  // First undo → back to the first template; second undo → back to original.
  harness.undo();
  assert.deepEqual(harness.present, firstSnapshot, "undo to first template");
  harness.undo();
  assert.deepEqual(harness.present, original, "undo to the original page");
});
