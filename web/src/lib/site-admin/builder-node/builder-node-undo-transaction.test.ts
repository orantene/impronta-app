import assert from "node:assert/strict";
import { test } from "node:test";

import { applyBuilderNodeOperation } from "./operations";
import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * Undo-as-ONE-transaction tests for the P3 builder capabilities:
 *   - inserting / editing a data-binding REPEATER  (container `dataBinding.repeat`)
 *   - picking a MEDIA-LIBRARY asset                 (image `mediaId`)
 *   - inserting a sandboxed CODE node               (kind `code`)
 *   - setting a FIELD BINDING                        (node `fieldBindings`)
 *
 * THE REGRESSION THESE GUARD — "broken undo". An editor action must push
 * EXACTLY ONE history entry and ⌘Z must restore the byte-exact prior tree.
 * The two classic ways this breaks:
 *
 *   1. The operation mutates the tree it was handed IN PLACE. The production
 *      commit path reads `builderTreeRef.current` as BOTH the pre-snapshot
 *      source AND (after an in-place op) the post tree, so its no-op guard
 *      `JSON.stringify(prev) === JSON.stringify(next)` (edit-context.tsx:4144)
 *      swallows the change → ZERO undo entries, change un-revertable.
 *   2. A single user action is implemented as MULTIPLE operations → multiple
 *      entries → ⌘Z only half-reverts.
 *
 * WHY A LOCAL HARNESS. The production single-entry seam —
 * `executeBuilderNodeOperation` → `commitBuilderTreeMutation` → `undo`
 * (web/src/components/edit-chrome/edit-context.tsx:4201-4282, 4141-4199,
 * 5644-5690) — is a React `useState`/`useRef` closure inside `EditProvider`.
 * It cannot be imported without a DOM and a mocked save server action, which
 * would break this suite's pure `tsx --test` convention. `BuilderTreeHistory`
 * below is a faithful, line-cited mirror of ONLY the stack mechanics (the
 * `JSON.stringify` no-op guard; push one `{pre, post}` of deep clones; clear
 * redo on a fresh edit; undo restores `pre`, redo restores `post`). The thing
 * that actually regresses — the OPERATIONS that feed the stack — is exercised
 * through the REAL `applyBuilderNodeOperation`, never a re-implementation.
 *
 * NOTE: the async-persistence / optimistic-CAS half this file deliberately
 * omits is now covered against the REAL EditProvider closures by the W0-T4
 * jsdom harness at web/test/components/edit-chrome/edit-context.undo.test.tsx.
 */

/** edit-context.tsx:2211 */
const HISTORY_CAP = 50;

interface BuilderTreeHistoryEntry {
  pre: BuilderNodeTree;
  post: BuilderNodeTree;
}

type OperationResult = ReturnType<typeof applyBuilderNodeOperation>;

/**
 * Faithful mirror of the builder-tree undo stack in edit-context.tsx. Async
 * persistence / optimistic CAS are intentionally omitted — they are orthogonal
 * to the entry-count + restoration contract under test.
 */
class BuilderTreeHistory {
  present: BuilderNodeTree;
  readonly past: BuilderTreeHistoryEntry[] = [];
  readonly future: BuilderTreeHistoryEntry[] = [];

  constructor(initial: BuilderNodeTree) {
    this.present = initial;
  }

  /** Mirror of `commitBuilderTreeMutation` (edit-context.tsx:4141-4199). */
  commit(next: BuilderNodeTree): { committed: boolean } {
    // No-op guard: identical serialized trees push NO history entry, so a
    // redundant edit (or an in-place-mutating op that returns its own input)
    // never creates a phantom/empty undo step. (edit-context.tsx:4144-4146)
    if (JSON.stringify(this.present) === JSON.stringify(next)) {
      return { committed: false };
    }
    this.past.push({
      pre: structuredClone(this.present),
      post: structuredClone(next),
    });
    if (this.past.length > HISTORY_CAP) this.past.shift();
    // A new edit branches away from any previous undo path. (edit-context.tsx:4179)
    this.future.length = 0;
    this.present = next;
    return { committed: true };
  }

  /**
   * Mirror of `executeBuilderNodeOperation`'s run→commit core
   * (edit-context.tsx:4201-4282): the op receives the LIVE present tree
   * (`builderTreeRef.current`); a failed op pushes no entry; a successful op
   * commits exactly once.
   */
  execute(run: (tree: BuilderNodeTree) => OperationResult): OperationResult {
    const result = run(this.present);
    if (!result.ok) return result;
    this.commit(result.tree);
    return result;
  }

  /** Mirror of `undo()` builderTree branch (edit-context.tsx:5644-5690). */
  undo(): void {
    const entry = this.past.pop();
    if (!entry) return;
    this.future.push(entry);
    this.present = entry.pre;
  }

  /** Mirror of `redo()` builderTree branch (edit-context.tsx:5692-5738). */
  redo(): void {
    const entry = this.future.pop();
    if (!entry) return;
    this.past.push(entry);
    this.present = entry.post;
  }
}

/** A minimal freeform page root container; feature nodes hang off it. */
function pageRoot(children: BuilderNode[]): BuilderNodeTree {
  return [
    {
      id: "page-root",
      kind: "container",
      props: { layout: "stack", gap: "m" },
      children,
    },
  ];
}

/** A collection-bound repeater: container `dataBinding.repeat` + a card template. */
function repeaterNode(id: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: {
        sourceKey: "featured_talent_profiles",
        mode: "bound",
        repeat: true,
        maxItems: 3,
      },
    },
    children: [
      {
        id: `${id}:card`,
        kind: "card",
        props: {},
        children: [
          {
            id: `${id}:name`,
            kind: "heading",
            props: { text: "Fallback name", level: 3, fieldBindings: { text: "displayName" } },
          },
        ],
      },
    ],
  } as BuilderNode;
}

/**
 * Drives `op` as a single editor transaction and asserts the full
 * one-undo-entry + clean-undo + redo contract.
 */
function assertSingleUndoTransaction(opts: {
  label: string;
  initial: BuilderNodeTree;
  op: (tree: BuilderNodeTree) => OperationResult;
  /** Asserts the committed tree actually carries the intended change. */
  expectChanged: (present: BuilderNodeTree) => void;
}): void {
  const { label } = opts;
  const history = new BuilderTreeHistory(opts.initial);
  const inputRef = history.present; // the exact object handed to the op
  const before = structuredClone(inputRef); // byte snapshot of the prior tree

  const result = history.execute(opts.op);
  assert.ok(result.ok, `${label}: operation should succeed`);

  // (1) IMMUTABILITY — the op must not mutate the tree it received in place,
  //     or the production commit's no-op guard would swallow the change.
  assert.deepEqual(
    inputRef,
    before,
    `${label}: operation mutated its input tree in place (would corrupt the undo snapshot)`,
  );

  // (2) EXACTLY ONE undo entry was pushed; the redo stack was cleared.
  assert.equal(history.past.length, 1, `${label}: expected exactly one undo entry`);
  assert.equal(history.future.length, 0, `${label}: a fresh edit must clear the redo stack`);

  // (3) The committed present carries the change (it is a REAL transaction).
  opts.expectChanged(history.present);
  assert.notEqual(
    JSON.stringify(history.present),
    JSON.stringify(before),
    `${label}: commit should change the tree`,
  );

  // (4) UNDO restores the byte-exact prior tree and pops the single entry.
  history.undo();
  assert.equal(history.past.length, 0, `${label}: undo should pop the single entry`);
  assert.deepEqual(history.present, before, `${label}: undo must restore the exact prior tree`);
  assert.equal(history.future.length, 1, `${label}: undo moves the entry onto the redo stack`);

  // (5) REDO re-applies the change exactly.
  history.redo();
  assert.equal(history.past.length, 1, `${label}: redo re-pushes the entry`);
  opts.expectChanged(history.present);

  // (6) NO-OP guard — re-committing the same tree pushes no new entry.
  const noop = history.commit(structuredClone(history.present));
  assert.equal(noop.committed, false, `${label}: a no-op commit must not create an undo entry`);
  assert.equal(history.past.length, 1, `${label}: no-op commit must not grow history`);
}

/** Walks the tree to find a node by id. */
function findNode(tree: BuilderNodeTree, id: string): BuilderNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if ("children" in node && Array.isArray(node.children)) {
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

test("undo: inserting a repeater is one transaction and reverts cleanly", () => {
  assertSingleUndoTransaction({
    label: "insert repeater",
    initial: pageRoot([{ id: "intro", kind: "heading", props: { text: "Roster", level: 2 } }]),
    // A repeater (container) is allowed at root — insert it as a sibling.
    op: (tree) =>
      applyBuilderNodeOperation({
        operation: "insert",
        tree,
        parentId: null,
        index: 1,
        node: repeaterNode("roster-grid"),
      }),
    expectChanged: (present) => {
      const grid = findNode(present, "roster-grid");
      assert.ok(grid && grid.kind === "container", "repeater container present");
      assert.equal(
        (grid.props as { dataBinding?: { repeat?: boolean } }).dataBinding?.repeat,
        true,
        "inserted node is a bound repeater",
      );
    },
  });
});

test("undo: editing a repeater's data binding is one transaction and reverts cleanly", () => {
  assertSingleUndoTransaction({
    label: "edit repeater binding",
    // A plain grid container that is NOT yet a repeater.
    initial: pageRoot([
      {
        id: "grid",
        kind: "container",
        props: { layout: "grid" },
        children: [{ id: "grid:card", kind: "card", props: {}, children: [] }],
      },
    ]),
    // Turning it INTO a repeater is a single `patch` of the dataBinding prop.
    op: (tree) =>
      applyBuilderNodeOperation({
        operation: "patch",
        tree,
        nodeId: "grid",
        patch: {
          dataBinding: { sourceKey: "featured_talent_profiles", mode: "bound", repeat: true, maxItems: 6 },
        },
      }),
    expectChanged: (present) => {
      const grid = findNode(present, "grid");
      assert.equal(
        (grid?.props as { dataBinding?: { repeat?: boolean; maxItems?: number } }).dataBinding?.repeat,
        true,
        "binding now repeats",
      );
      assert.equal(
        (grid?.props as { dataBinding?: { maxItems?: number } }).dataBinding?.maxItems,
        6,
        "maxItems applied",
      );
    },
  });
});

test("undo: picking a media-library asset (mediaId) is one transaction and reverts cleanly", () => {
  const mediaId = "11111111-1111-4111-8111-111111111111";
  assertSingleUndoTransaction({
    label: "pick mediaId",
    initial: pageRoot([{ id: "hero-img", kind: "image", props: { src: "", alt: "" } }]),
    op: (tree) =>
      applyBuilderNodeOperation({ operation: "patch", tree, nodeId: "hero-img", patch: { mediaId } }),
    expectChanged: (present) => {
      const img = findNode(present, "hero-img");
      assert.equal((img?.props as { mediaId?: string }).mediaId, mediaId, "mediaId bound to node");
    },
  });
});

test("undo: inserting a sandboxed code node is one transaction and reverts cleanly", () => {
  assertSingleUndoTransaction({
    label: "insert code node",
    initial: pageRoot([{ id: "intro", kind: "heading", props: { text: "Embed", level: 2 } }]),
    // `code` is allowed inside a container — insert into the page root.
    op: (tree) =>
      applyBuilderNodeOperation({
        operation: "insert",
        tree,
        parentId: "page-root",
        index: 1,
        node: { id: "widget", kind: "code", props: { html: "<h2>Widget</h2>", minHeight: 200 } } as BuilderNode,
      }),
    expectChanged: (present) => {
      const code = findNode(present, "widget");
      assert.ok(code && code.kind === "code", "code node present");
      assert.equal((code.props as { html?: string }).html, "<h2>Widget</h2>", "code html carried");
    },
  });
});

test("undo: setting a field binding is one transaction and reverts cleanly", () => {
  assertSingleUndoTransaction({
    label: "set field binding",
    initial: pageRoot([{ id: "name", kind: "heading", props: { text: "Fallback name", level: 3 } }]),
    op: (tree) =>
      applyBuilderNodeOperation({
        operation: "patch",
        tree,
        nodeId: "name",
        patch: { fieldBindings: { text: "displayName" } },
      }),
    expectChanged: (present) => {
      const name = findNode(present, "name");
      assert.equal(
        (name?.props as { fieldBindings?: { text?: string } }).fieldBindings?.text,
        "displayName",
        "field binding applied",
      );
    },
  });
});

test("undo: each operation is a SEPARATE entry — two edits undo LIFO back to the start", () => {
  // Guards against the inverse bug: collapsing distinct edits so ⌘Z over-reverts,
  // or coupling them so one entry reverts both.
  const history = new BuilderTreeHistory(
    pageRoot([{ id: "name", kind: "heading", props: { text: "Fallback", level: 3 } }]),
  );
  const start = structuredClone(history.present);

  const insert = history.execute((tree) =>
    applyBuilderNodeOperation({
      operation: "insert",
      tree,
      parentId: "page-root",
      index: 1,
      node: { id: "widget", kind: "code", props: { html: "<p>x</p>" } } as BuilderNode,
    }),
  );
  assert.ok(insert.ok);
  const afterInsert = structuredClone(history.present);

  const patch = history.execute((tree) =>
    applyBuilderNodeOperation({
      operation: "patch",
      tree,
      nodeId: "name",
      patch: { fieldBindings: { text: "displayName" } },
    }),
  );
  assert.ok(patch.ok);

  assert.equal(history.past.length, 2, "two independent edits → two undo entries");

  history.undo(); // reverts only the field binding
  assert.deepEqual(history.present, afterInsert, "first undo reverts only the most recent edit");

  history.undo(); // reverts the code insert
  assert.deepEqual(history.present, start, "second undo restores the original tree");
  assert.equal(history.past.length, 0, "history drained");
});

test("undo: a no-op edit creates NO transaction (operation layer rejects it)", () => {
  // The first line of defense against phantom undo steps: the operation itself
  // refuses to produce a new tree when nothing changes, so `execute` never
  // reaches `commit`.
  const history = new BuilderTreeHistory(
    pageRoot([{ id: "name", kind: "heading", props: { text: "Same", level: 3, fieldBindings: { text: "displayName" } } }]),
  );

  const result = history.execute((tree) =>
    applyBuilderNodeOperation({
      operation: "patch",
      tree,
      nodeId: "name",
      patch: { fieldBindings: { text: "displayName" } }, // identical to current
    }),
  );

  assert.equal(result.ok, false, "a no-op patch is rejected by the operation");
  assert.equal(history.past.length, 0, "no undo entry was created for a no-op edit");
});
