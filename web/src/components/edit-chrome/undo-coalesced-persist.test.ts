import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wave 3 (3.5) — rapid undo must not serialize one server round-trip per step.
 *
 * THE DEFECT THIS GUARDS. `undo()` used to await `persistBuilderTree(entry.pre)`
 * directly, so holding Cmd-Z produced N saves for N steps, each one blocking the
 * next. A `saving` gate on top of that collapsed the burst into a single queued
 * step, so the further back the operator went the worse it felt.
 *
 * THE FIX. A `builderTree` undo is "make the tree equal `entry.pre`" and nothing
 * else, so it rides the same optimistic + debounced lane a normal edit rides:
 * the tree is applied locally at once and the pending server tree is SUPERSEDED
 * rather than flushed. A burst therefore costs ONE persist, for the tree the
 * burst lands on.
 *
 * WHY A LOCAL HARNESS. The production seam is React state + refs inside
 * `EditProvider`; it cannot be imported without a DOM. `CoalescingHarness` below
 * is a faithful, line-cited mirror of the pieces that decide the request count:
 * the pending-tree slot, the debounce, the queue, and the undo/redo lane that
 * now feeds them. Static-source assertions then prove the production wiring, so
 * a refactor that re-introduces the awaited persist fails this suite.
 */

// ── The coalescing model ─────────────────────────────────────────────────────

type Tree = { size: number };

interface BuilderTreeEntry {
  kind: "builderTree";
  pre: Tree;
  post: Tree;
}
interface FieldEditEntry {
  kind: "fieldEdit";
  pre: Tree;
  post: Tree;
}
type Entry = BuilderTreeEntry | FieldEditEntry;

/**
 * Mirror of the edit-context save spine:
 *   - `pendingTreeRef` + `builderSaveTimerRef` (the debounce)
 *   - `flushBuilderTreeSave` (one `persistBuilderTree` per flush)
 *   - `queueBuilderTreePersist` (the single coalescing entry point)
 *   - `undo`/`redo`'s builderTree lane, including the EAGER `pastRef`/`futureRef`
 *     mirrors that make a burst safe without an await between steps
 *   - `pendingHistoryRollbackRef` (pre-burst stacks, restored on flush failure)
 */
class CoalescingHarness {
  tree: Tree = { size: 0 };
  /** Synchronous mirrors the undo machine reads (never the React state). */
  pastRef: Entry[] = [];
  futureRef: Entry[] = [];
  /** Server-confirmed tree; the rollback target of a failed flush. */
  lastConfirmed: Tree = this.tree;
  /** Every persist actually sent to the server. Length === request count. */
  saves: Tree[] = [];
  saveOutcome: "ok" | "fail" = "ok";

  private pendingTree: Tree | null = null;
  private timerArmed = false;
  private rollback: { past: Entry[]; future: Entry[] } | null = null;

  private beginPendingHistoryBurst(): void {
    if (this.rollback !== null) return;
    this.rollback = { past: this.pastRef, future: this.futureRef };
  }

  /** Mirror of `queueBuilderTreePersist`. Optimistic now, server later. */
  private queuePersist(next: Tree): void {
    this.tree = next;
    this.pendingTree = next;
    this.timerArmed = true;
  }

  /** Mirror of `flushBuilderTreeSave` (the debounce timer firing). */
  flush(): void {
    this.timerArmed = false;
    const pending = this.pendingTree;
    if (pending === null) return;
    this.pendingTree = null;
    const rollback = this.rollback;
    this.rollback = null;
    this.saves.push(pending);
    if (this.saveOutcome === "ok") {
      this.lastConfirmed = pending;
      return;
    }
    // Failure: persistBuilderTree restores the last-confirmed tree, and the
    // flush handler restores the stacks the burst started from.
    this.tree = this.lastConfirmed;
    if (rollback) {
      this.pastRef = rollback.past;
      this.futureRef = rollback.future;
    }
  }

  get hasPendingSave(): boolean {
    return this.timerArmed;
  }

  /** Mirror of `commitBuilderTreeMutation`. */
  edit(next: Tree): void {
    const prev = this.tree;
    this.beginPendingHistoryBurst();
    this.pastRef = [...this.pastRef, { kind: "builderTree", pre: prev, post: next }];
    this.futureRef = [];
    this.queuePersist(next);
  }

  /** Mirror of the `undo()` builderTree lane. Synchronous by design. */
  undo(): boolean {
    const top = this.pastRef[this.pastRef.length - 1];
    if (!top) return false;
    if (top.kind !== "builderTree") return false;
    this.beginPendingHistoryBurst();
    this.pastRef = this.pastRef.slice(0, -1);
    this.futureRef = [...this.futureRef, top];
    this.queuePersist(top.pre);
    return true;
  }

  /** Mirror of the `redo()` builderTree lane. */
  redo(): boolean {
    const top = this.futureRef[this.futureRef.length - 1];
    if (!top) return false;
    if (top.kind !== "builderTree") return false;
    this.beginPendingHistoryBurst();
    this.futureRef = this.futureRef.slice(0, -1);
    this.pastRef = [...this.pastRef, top];
    this.queuePersist(top.post);
    return true;
  }
}

// ── The behaviour ────────────────────────────────────────────────────────────

test("a burst of 6 rapid undos costs ONE server persist, not six", () => {
  const m = new CoalescingHarness();
  for (let i = 1; i <= 6; i++) m.edit({ size: i });
  m.flush();
  assert.equal(m.saves.length, 1, "the six edits themselves coalesced to one save");
  assert.deepEqual(m.tree, { size: 6 });

  const savesBeforeUndo = m.saves.length;
  for (let i = 0; i < 6; i++) assert.equal(m.undo(), true, "every undo step applied");

  // THE CLAIM: the whole burst is on screen before ANY request has been made.
  assert.equal(
    m.saves.length,
    savesBeforeUndo,
    "no server round-trip happened DURING the burst (the old code did six)",
  );
  assert.deepEqual(m.tree, { size: 0 }, "the canvas tree walked all six steps back");

  m.flush();
  assert.equal(m.saves.length, savesBeforeUndo + 1, "the burst cost exactly one persist");
  assert.deepEqual(
    m.saves[m.saves.length - 1],
    { size: 0 },
    "and that persist carries the tree the burst LANDED on, not an intermediate",
  );
});

test("the pending unsaved edit is superseded by an undo, never flushed first", () => {
  const m = new CoalescingHarness();
  m.edit({ size: 1 });
  m.edit({ size: 2 });
  assert.equal(m.hasPendingSave, true, "a save is owed but not yet sent");

  m.undo();
  m.undo();
  m.flush();

  assert.equal(
    m.saves.length,
    1,
    "the owed tree was replaced by the undo target, not sent and then undone",
  );
  assert.deepEqual(m.saves[0], { size: 0 }, "only the landed tree reached the server");
});

test("undo and redo stay consistent across a coalesced burst", () => {
  const m = new CoalescingHarness();
  m.edit({ size: 1 });
  m.edit({ size: 2 });
  m.edit({ size: 3 });
  m.flush();

  m.undo();
  m.undo();
  assert.deepEqual(m.tree, { size: 1 });
  assert.equal(m.futureRef.length, 2, "both undone entries are redoable");

  m.redo();
  assert.deepEqual(m.tree, { size: 2 });
  assert.equal(m.pastRef.length, 2);
  assert.equal(m.futureRef.length, 1);

  m.flush();
  assert.deepEqual(m.saves[m.saves.length - 1], { size: 2 }, "server matches the stack");
});

test("an edit right after an undo supersedes the undone tree and kills redo", () => {
  // Perf-spine regression: undo is optimistic and its persist is debounced, so
  // an edit landing INSIDE that debounce window must (a) supersede the owed
  // undone tree (never resurrect the undone state on the server), and (b) clear
  // `future` so the abandoned branch is unreachable.
  const m = new CoalescingHarness();
  m.edit({ size: 1 });
  m.edit({ size: 2 });
  m.flush(); // server confirmed {2}
  assert.equal(m.undo(), true); // optimistic {1}; {1} owed to the server
  // The operator types again IMMEDIATELY — before the undo's debounce fires.
  m.edit({ size: 7 });
  assert.deepEqual(m.tree, { size: 7 });
  assert.equal(m.futureRef.length, 0, "a new edit branches away from redo");
  assert.equal(m.redo(), false, "the undone {2} can never be resurrected");
  m.flush();
  assert.deepEqual(
    m.saves,
    [{ size: 2 }, { size: 7 }],
    "ONE persist since the confirmed {2}: the new edit — the intermediate undone tree never hit the server",
  );
  assert.deepEqual(m.lastConfirmed, { size: 7 });
  // History is coherent: the new edit's `pre` is the undone-to state, so a
  // further undo steps back to {1}, not to the abandoned branch.
  assert.equal(m.undo(), true);
  assert.deepEqual(m.tree, { size: 1 });
});

test("a failed flush restores BOTH stacks, not just a count of past entries", () => {
  const m = new CoalescingHarness();
  m.edit({ size: 1 });
  m.edit({ size: 2 });
  m.flush();
  const pastAtBurstStart = m.pastRef;
  const futureAtBurstStart = m.futureRef;
  assert.deepEqual(m.tree, { size: 2 });

  // A rapid undo burst that the server then rejects. The old pop-N-entries
  // rollback could not model this: the burst POPPED `past` and PUSHED `future`.
  m.saveOutcome = "fail";
  m.undo();
  m.undo();
  m.flush();

  assert.deepEqual(m.tree, { size: 2 }, "tree is back at the last confirmed state");
  assert.deepEqual(m.pastRef, pastAtBurstStart, "past restored to the pre-burst stack");
  assert.deepEqual(
    m.futureRef,
    futureAtBurstStart,
    "future restored too — a pop-N counter would have left two phantom redo entries",
  );
});

test("a non-builderTree entry does NOT take the coalesced lane", () => {
  const m = new CoalescingHarness();
  m.pastRef = [{ kind: "fieldEdit", pre: { size: 0 }, post: { size: 9 } }];
  assert.equal(
    m.undo(),
    false,
    "curated field/section replays keep the awaited action path",
  );
});

// ── Static-source wiring proofs ──────────────────────────────────────────────

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const editContextSource = readFileSync(join(THIS_DIR, "edit-context.tsx"), "utf-8");

test("wiring: undo/redo route builderTree through the coalescing entry point", () => {
  assert.ok(
    /const queueBuilderTreePersist = useCallback/.test(editContextSource),
    "the single coalescing entry point exists",
  );
  // Three CALL sites: commitBuilderTreeMutation, undo, redo. (The declaration
  // reads `= useCallback(`, so it is not counted here.)
  const queued = (editContextSource.match(/queueBuilderTreePersist\(/g) ?? []).length;
  assert.ok(
    queued >= 3,
    `commit, undo and redo all queue instead of awaiting a persist (found ${queued})`,
  );
  assert.ok(
    /queueBuilderTreePersist\(top\.post\)/.test(editContextSource),
    "redo queues the entry's post-tree",
  );
});

test("wiring: neither undo nor redo awaits a persist on the builderTree lane", () => {
  // The awaited `persistBuilderTree` calls that remain belong to the
  // composition/restore lanes, which are reached only after the builderTree
  // branch has returned. Guard the shape that matters: the builderTree branch
  // must return before any await.
  const undoBody = editContextSource.slice(
    editContextSource.indexOf("const undo = useCallback"),
    editContextSource.indexOf("const redo = useCallback"),
  );
  assert.ok(undoBody.length > 0, "found the undo callback");
  const lane = undoBody.slice(
    undoBody.indexOf('if (top.kind === "builderTree")'),
    undoBody.indexOf("// ── Awaited lane"),
  );
  assert.ok(lane.length > 0, "found the coalesced builderTree lane in undo");
  assert.ok(!/await /.test(lane), "the builderTree undo lane contains no await");
  assert.ok(
    /queueBuilderTreePersist\(top\.pre\)/.test(lane),
    "it queues the entry's pre-tree",
  );
});

test("wiring: the burst mirrors pastRef/futureRef eagerly", () => {
  // Without the eager mirrors, several undos can run before React commits and
  // each one would pop the SAME entry.
  assert.ok(
    /pastRef\.current = pastRef\.current\.slice\(0, -1\)/.test(editContextSource),
    "undo mirrors the pop into pastRef synchronously",
  );
  assert.ok(
    /futureRef\.current = futureRef\.current\.slice\(0, -1\)/.test(editContextSource),
    "redo mirrors the pop into futureRef synchronously",
  );
});

test("wiring: the burst rollback is a stack pair, not a count", () => {
  assert.ok(
    /pendingHistoryRollbackRef/.test(editContextSource),
    "the pre-burst stack pair is captured",
  );
  assert.ok(
    !/pendingHistoryCountRef/.test(editContextSource),
    "the old pop-N-entries counter is gone (it cannot model an undo burst)",
  );
  assert.ok(
    /const beginPendingHistoryBurst = useCallback/.test(editContextSource),
    "one helper opens the burst for both edits and history replays",
  );
});

test("wiring: the #996 canvas preview teardown still runs before undo reads the stack", () => {
  // PR #996: toolbar style previews are stamped straight onto the DOM and must be
  // stripped (restoring the ORIGINAL value beneath) when an authoritative tree
  // lands, or undo reverts the data while the canvas keeps the undone value.
  // Coalescing the persist must not move or drop this.
  const undoBody = editContextSource.slice(
    editContextSource.indexOf("const undo = useCallback"),
    editContextSource.indexOf("const redo = useCallback"),
  );
  const clearAt = undoBody.indexOf("clearCanvasTextStylePreview()");
  const cancelAt = undoBody.indexOf("cancelCanvasTextStylePatches()");
  const laneAt = undoBody.indexOf('if (top.kind === "builderTree")');
  assert.ok(cancelAt > -1 && clearAt > -1, "undo still tears the preview layer down");
  assert.ok(
    cancelAt < laneAt && clearAt < laneAt,
    "and does it BEFORE the coalesced lane applies the restored tree",
  );
});
