import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  commitActiveInlineEditor,
  hasPendingInlineEditorCommit,
  registerInlineEditorCommit,
} from "./canvas-lexical-bridge";

/**
 * CANVAS-7B — explicit undo focus-routing between the inline text editor and
 * node history (commit-on-blur).
 *
 * THE CONTRACT THIS GUARDS. While an inline text editor is focused, ⌘Z/⌘⇧Z are
 * owned by the editor's OWN text history (edit-shell defers via
 * `isEditableKeyboardTarget`). The hazard is the seam right AFTER the operator
 * leaves the editor: the overlay commits its text asynchronously
 * (`patchBuilderNodeProps` → `setPast`), and the `pastRef` mirror the undo
 * machine reads only updates on the NEXT React commit. A ⌘Z fired in that gap
 * would undo the PRIOR node op and silently drop the freshly-typed text.
 *
 * The fix is two coupled guarantees, both exercised below:
 *   (1) EditContext.undo/redo AWAIT `commitActiveInlineEditor()` before reading
 *       the history stack, so any open inline edit is committed to node history
 *       FIRST.
 *   (2) `commitBuilderTreeMutation` mirrors the new history entry into `pastRef`
 *       SYNCHRONOUSLY at push time (not only via the post-render effect), so the
 *       just-typed text's entry is visible to the undo that ran right after the
 *       awaited commit resolved.
 *
 * WHY A LOCAL HARNESS. The production seam is React state + refs inside
 * `EditProvider` plus a Lexical overlay; neither can be imported without a DOM.
 * `UndoMachineHarness` is a faithful, line-cited mirror of ONLY the undo-stack +
 * eager-`pastRef`-mirror + the inline-commit handoff. The real
 * `commitActiveInlineEditor` / `registerInlineEditorCommit` bridge IS imported
 * and exercised for real. Static-source assertions then prove the production
 * wiring (the await in undo/redo, the eager `pastRef` mirror, the overlay
 * commit-ref) so a refactor that drops the handoff fails the suite.
 */

// ── (1) The real bridge handoff (imported, exercised for real) ────────────────

test("bridge: no handle registered → commitActiveInlineEditor is a no-op", async () => {
  registerInlineEditorCommit(null);
  assert.equal(hasPendingInlineEditorCommit(), false);
  // Resolves without throwing and without doing anything.
  await commitActiveInlineEditor();
  assert.equal(hasPendingInlineEditorCommit(), false);
});

test("bridge: a registered handle is awaited by commitActiveInlineEditor", async () => {
  let ran = false;
  let resolveCommit: (() => void) | null = null;
  registerInlineEditorCommit(
    () =>
      new Promise<void>((resolve) => {
        ran = true;
        resolveCommit = resolve;
      }),
  );
  assert.equal(hasPendingInlineEditorCommit(), true);

  let settled = false;
  const p = commitActiveInlineEditor().then(() => {
    settled = true;
  });
  // Let the handle start, but it has not resolved yet.
  await Promise.resolve();
  assert.equal(ran, true, "the handle ran");
  assert.equal(settled, false, "commitActiveInlineEditor awaits the handle");

  resolveCommit!();
  await p;
  assert.equal(settled, true, "resolves once the inline commit settles");
  registerInlineEditorCommit(null);
});

// ── (2) The undo machine + handoff (faithful mirror) ─────────────────────────

type Tree = { text: string };

interface BuilderTreeEntry {
  kind: "builderTree";
  pre: Tree;
  post: Tree;
}

/**
 * Faithful mirror of the EditContext undo machine for the inline-edit handoff.
 *
 * Mirrors:
 *   - `commitBuilderTreeMutation` pushing a `builderTree` entry AND eagerly
 *     mirroring it into `pastRef` synchronously (edit-context.tsx) — the React
 *     `setPast` is modelled as a deferred microtask so the test reproduces the
 *     exact "pastRef updates only on the next commit" hazard the fix closes.
 *   - `undo()` awaiting `commitActiveInlineEditor()` before reading `pastRef`.
 *   - the inline overlay's async commit that calls `commitBuilderTreeMutation`.
 */
class UndoMachineHarness {
  tree: Tree = { text: "" };
  /** The synchronous mirror the undo machine actually reads. */
  pastRef: BuilderTreeEntry[] = [];
  /**
   * The "React state" — in production it is `past`, and `pastRef = past` runs in
   * a useEffect AFTER the next render commit. We model that as a pending queue
   * that only lands when `flushReactCommit()` is explicitly called, so a test
   * can prove the undo works reading ONLY pastRef, before any React flush.
   */
  private pastState: BuilderTreeEntry[] = [];
  private pendingStatePush: BuilderTreeEntry[] = [];

  /** Mirror of `commitBuilderTreeMutation` (edit-context.tsx). */
  commitBuilderTreeMutation(nextTree: Tree): void {
    const prevTree = this.tree;
    if (prevTree === nextTree) return;
    this.tree = nextTree;
    const entry: BuilderTreeEntry = {
      kind: "builderTree",
      pre: prevTree,
      post: nextTree,
    };
    // The DEFERRED React state push (the hazard source). It only lands on the
    // next render commit — NOT synchronously. If the undo machine read this
    // instead of pastRef, the just-typed entry would be invisible.
    this.pendingStatePush.push(entry);
    // CANVAS-7B — the EAGER synchronous mirror. THIS is what makes the
    // post-commit undo see the typed text without waiting for a React flush.
    this.pastRef = [...this.pastRef, entry];
  }

  /** Simulate React committing a render: the pastRef = past effect runs. */
  flushReactCommit(): void {
    this.pastState = [...this.pastState, ...this.pendingStatePush];
    this.pendingStatePush = [];
  }

  /** Mirror of `undo()` — awaits the inline commit, THEN reads pastRef. */
  async undo(): Promise<{ undoneTo: string } | null> {
    // CANVAS-7B — commit any open inline edit to node history FIRST.
    await commitActiveInlineEditor();
    if (this.pastRef.length === 0) return null;
    const entry = this.pastRef[this.pastRef.length - 1]!;
    this.pastRef = this.pastRef.slice(0, -1);
    this.tree = entry.pre;
    return { undoneTo: entry.pre.text };
  }

  /** Read of the deferred "React state" for assertions about ordering. */
  get reactStateDepth(): number {
    return this.pastState.length;
  }
}

test("type → blur → ⌘Z undoes the TYPED text, never the prior node op", async () => {
  const m = new UndoMachineHarness();

  // A prior node op already happened (e.g. a heading was inserted/edited). Its
  // React state commits normally.
  m.commitBuilderTreeMutation({ text: "Heading A" });
  m.flushReactCommit();
  assert.equal(m.tree.text, "Heading A");
  assert.equal(m.reactStateDepth, 1, "prior op recorded in React state");

  // The operator double-clicks a text node and TYPES new copy into the inline
  // editor. The overlay's commit is async (patchBuilderNodeProps). We register
  // it as the inline-commit handle, exactly as inline-editor.tsx does. The
  // handle commits SYNCHRONOUSLY into pastRef, but its React state push is left
  // PENDING (no flushReactCommit) — reproducing the exact post-blur hazard
  // window where the operator hits ⌘Z before React re-renders.
  let committed = false;
  registerInlineEditorCommit(async () => {
    // Mirror the overlay blur path: commit the live text → node history.
    m.commitBuilderTreeMutation({ text: "Heading B (typed)" });
    committed = true;
    // Deliberately do NOT flush the React commit — the undo below must succeed
    // reading ONLY the eager pastRef mirror.
  });

  const result = await m.undo();

  // The typed edit's deferred React state had NOT flushed when undo read the
  // stack — exactly the window that, without the eager pastRef mirror, would
  // make the typed entry invisible and drop the operator's text.
  assert.equal(
    m.reactStateDepth,
    1,
    "the typed edit's deferred React state had not flushed when undo read pastRef",
  );

  // SAFETY: the first ⌘Z undoes the freshly-TYPED text edit (Heading B → back to
  // Heading A), NOT the prior op while silently dropping the typed text.
  assert.equal(committed, true, "the inline edit was committed before undo read");
  assert.ok(result, "undo had an entry to pop");
  assert.equal(
    result.undoneTo,
    "Heading A",
    "first ⌘Z reverts the typed text to the pre-edit value",
  );
  assert.equal(
    m.tree.text,
    "Heading A",
    "the typed text was undone (and was never silently dropped)",
  );

  // Clear the handle (the overlay closed after commit).
  registerInlineEditorCommit(null);

  // A SECOND ⌘Z then cleanly undoes the prior node op — proving the typed text
  // landed as its OWN distinct history entry, not fused with the prior op.
  const second = await m.undo();
  assert.ok(second, "a second entry (the prior op) is present");
  assert.equal(
    second.undoneTo,
    "",
    "second ⌘Z reverts the prior node op to the empty baseline",
  );
});

test("commit-on-blur lands BEFORE undo reads the stack (no race)", async () => {
  const m = new UndoMachineHarness();
  m.commitBuilderTreeMutation({ text: "before" });

  let order: string[] = [];
  registerInlineEditorCommit(async () => {
    order.push("inline-commit");
    m.commitBuilderTreeMutation({ text: "typed" });
  });

  // Kick off undo; it must commit the inline edit first, then pop.
  const undone = await m.undo();
  order.push("undo-read");

  assert.deepEqual(
    order,
    ["inline-commit", "undo-read"],
    "the inline text commits to node history BEFORE undo reads pastRef",
  );
  assert.equal(undone?.undoneTo, "before", "undo reverts the typed text");
  registerInlineEditorCommit(null);
});

// ── (3) Static-source wiring proofs ──────────────────────────────────────────

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const editContextSource = readFileSync(
  join(THIS_DIR, "edit-context.tsx"),
  "utf-8",
);
const inlineEditorSource = readFileSync(
  join(THIS_DIR, "inline-editor.tsx"),
  "utf-8",
);
const bridgeSource = readFileSync(
  join(THIS_DIR, "canvas-lexical-bridge.ts"),
  "utf-8",
);
const overlaySource = readFileSync(
  join(THIS_DIR, "rich-editor", "CanvasEditOverlay.tsx"),
  "utf-8",
);

test("undo wiring: EditContext.undo AND redo await the inline-editor commit", () => {
  // The handoff must run BEFORE the history stack is read — proving the text
  // edit is recorded as a node-history entry before a node-level undo fires.
  assert.ok(
    editContextSource.includes("commitActiveInlineEditor"),
    "edit-context imports + calls the inline-commit handoff",
  );
  // Both undo and redo must await it. Count the awaited call sites.
  const awaited = (
    editContextSource.match(/await commitActiveInlineEditor\(\)/g) ?? []
  ).length;
  assert.ok(
    awaited >= 2,
    `undo + redo both await commitActiveInlineEditor (found ${awaited})`,
  );
});

test("undo wiring: commitBuilderTreeMutation mirrors the push into pastRef eagerly", () => {
  // Without the synchronous pastRef mirror, the awaited commit would resolve but
  // pastRef (read by undo) would still be stale until the next React commit.
  assert.ok(
    /pastRef\.current\s*=\s*capHistory\(\[\s*\.\.\.pastRef\.current/.test(
      editContextSource,
    ),
    "the builderTree push eagerly mirrors into pastRef.current",
  );
  assert.ok(
    /futureRef\.current\s*=\s*\[\]/.test(editContextSource),
    "the push eagerly clears futureRef (a new edit branches away from redo)",
  );
});

test("inline wiring: the overlay registers a commit handle that the undo awaits", () => {
  assert.ok(
    inlineEditorSource.includes("registerInlineEditorCommit"),
    "inline-editor registers its commit handle on the bridge",
  );
  // The handle forces the overlay's own commit (same path as a blur), then
  // awaits the in-flight commit promise.
  assert.ok(
    inlineEditorSource.includes("overlayCommitRef.current?.()"),
    "the handle forces the overlay's own commit() (no parallel commit path)",
  );
  assert.ok(
    inlineEditorSource.includes("pendingCommitRef"),
    "the handle awaits the in-flight commit promise before resolving",
  );
  // Deregistration on close so a stale handle never fires.
  assert.ok(
    /registerInlineEditorCommit\(null\)/.test(inlineEditorSource),
    "the handle is deregistered when no inline editor is open",
  );
});

test("inline wiring: endActiveEdit AWAITS the node-history commit (commit-on-blur)", () => {
  // The builder-node commit must be awaited so the handoff can guarantee the
  // typed text is in `past` before undo reads it. A `void`-only call would race.
  assert.ok(
    /await commitBuilderNodeText\(/.test(inlineEditorSource),
    "endActiveEdit awaits commitBuilderNodeText (no fire-and-forget race)",
  );
});

test("overlay wiring: CanvasEditOverlay exposes its commit() via commitRef", () => {
  assert.ok(
    overlaySource.includes("commitRef"),
    "the overlay accepts a commitRef so the parent can force a commit",
  );
  assert.ok(
    /commitRef\.current\s*=\s*commit/.test(overlaySource),
    "the overlay stashes its own commit() into commitRef",
  );
  assert.ok(
    /commitRef\.current\s*=\s*null/.test(overlaySource),
    "the overlay clears commitRef on unmount (no stale handle)",
  );
});

test("bridge wiring: the inline-commit registry is a single shared seam", () => {
  for (const fn of [
    "registerInlineEditorCommit",
    "commitActiveInlineEditor",
    "hasPendingInlineEditorCommit",
  ]) {
    assert.ok(
      bridgeSource.includes(`export function ${fn}`) ||
        bridgeSource.includes(`export async function ${fn}`),
      `canvas-lexical-bridge exports ${fn} (one shared handoff seam)`,
    );
  }
});
