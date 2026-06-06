/**
 * save-conflict-protocol.test.ts — Marathon W0-T5(b).
 *
 * The save / version-conflict / rollback path lives inside `edit-context.tsx`
 * (commitBuilderTreeMutation → debounce → flushBuilderTreeSave →
 * persistBuilderTree → rollback) and cannot be imported without a DOM and a
 * mocked server action. So this file pins the CONTRACT against a faithful
 * state-machine simulator (`BuilderSaveSimulator`) that mirrors the production
 * closures exactly:
 *
 *   - commitMutation(next)      mirrors commitBuilderTreeMutation (edit-context
 *                               :4141): optimistic apply, push ONE undo entry,
 *                               bump pendingHistoryCount, arm debounce, dirty=true.
 *   - flushSave(outcome)        mirrors flushBuilderTreeSave (:4095): rollback
 *                               target = lastConfirmedTree, capture burst history
 *                               count, run persist, and on FAILURE pop that many
 *                               undo entries (:4119-4124); clear dirty when no work
 *                               remains.
 *   - persist                   mirrors persistBuilderTree (:3969): prevTree =
 *                               rollbackTarget ?? present; ok → bump pageVersion,
 *                               set lastConfirmedTree, saving=false; VERSION_CONFLICT
 *                               → revert to prevTree, saving=false, refreshComposition;
 *                               network → revert, saving=false, NO refresh.
 *
 * These assertions are the seatbelt Wave 1 (undo coverage, conflict recovery)
 * and the eventual context split must not break.
 *
 * Runner: node:test via `tsx --test` (pure state machine, no DOM, no React, no
 * server action). Already in CI via `test:builder-node-bindings`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

type Tree = { tag: string };
type SaveOutcome = "ok" | "conflict" | "network";

interface HistoryEntry {
  kind: "builderTree";
  pre: Tree;
  post: Tree;
}

/**
 * A minimal mirror of the edit-context save state machine. Field names match the
 * production refs/state so the mapping is auditable:
 *   present            ↔ builderTreeRef.current / builderTree
 *   past               ↔ the undo stack
 *   pageVersion        ↔ pageVersionRef.current
 *   saving             ↔ saving
 *   lastConfirmedTree  ↔ lastConfirmedTreeRef.current
 *   pendingTree        ↔ pendingTreeRef.current
 *   pendingHistoryCount↔ pendingHistoryCountRef.current
 *   refreshCompositions↔ count of refreshComposition() calls (the history wipe)
 */
class BuilderSaveSimulator {
  present: Tree;
  past: HistoryEntry[] = [];
  future: HistoryEntry[] = [];
  pageVersion: number;
  saving = false;
  lastConfirmedTree: Tree;
  pendingTree: Tree | null = null;
  pendingHistoryCount = 0;
  refreshCompositions = 0;

  constructor(initial: Tree, pageVersion: number) {
    this.present = initial;
    this.lastConfirmedTree = initial;
    this.pageVersion = pageVersion;
  }

  /** mirrors commitBuilderTreeMutation (:4141). */
  commitMutation(next: Tree): void {
    const prev = this.present;
    // No-op guard (:4144) — identical tree pushes nothing.
    if (prev.tag === next.tag) return;
    this.present = next; // optimistic apply (:4154)
    this.past.push({ kind: "builderTree", pre: prev, post: next }); // (:4169)
    this.future = []; // clear redo (:4179)
    this.pendingTree = next; // coalesce (:4183)
    this.pendingHistoryCount += 1; // (:4184)
    // dirty=true (:4185), debounce armed — modelled by the caller invoking flushSave.
  }

  /** mirrors flushBuilderTreeSave (:4095) + the persist it enqueues. */
  flushSave(outcome: SaveOutcome): void {
    const pending = this.pendingTree;
    if (pending === null) return; // nothing owed (:4101)
    this.pendingTree = null; // (:4106)
    const rollbackTarget = this.lastConfirmedTree; // (:4107) — NOT the latest optimistic tree
    const burstHistoryCount = this.pendingHistoryCount; // (:4108)
    this.pendingHistoryCount = 0; // (:4109)

    const result = this.persist(pending, rollbackTarget, outcome);

    if (!result.ok && burstHistoryCount > 0) {
      // Roll back every optimistic history entry queued during this burst
      // (:4121-4123) so undo depth matches the last-confirmed tree.
      this.past = this.past.slice(0, this.past.length - burstHistoryCount);
    }
  }

  /** mirrors persistBuilderTree (:3969). */
  private persist(
    nextTree: Tree,
    rollbackTarget: Tree | undefined,
    outcome: SaveOutcome,
  ): { ok: boolean; code?: "VERSION_CONFLICT" | "network" } {
    const prevTree = rollbackTarget ?? this.present; // (:3988)
    this.present = nextTree; // optimistic (:3990)
    this.saving = true; // (:3991)

    if (outcome === "ok") {
      this.saving = false; // (:4014)
      this.pageVersion += 1; // (:4052-4053) — server returns a bumped version
      this.lastConfirmedTree = nextTree; // (:4054)
      return { ok: true };
    }
    // failure path (:4015-4050)
    this.saving = false; // (:4014, runs before the branch)
    this.present = prevTree; // revert (:4016-4017)
    if (outcome === "conflict") {
      this.refreshCompositions += 1; // refreshComposition() (:4019) — wipes history
      return { ok: false, code: "VERSION_CONFLICT" };
    }
    return { ok: false, code: "network" }; // NO refreshComposition (:4036-4050)
  }
}

const T = (tag: string): Tree => ({ tag });

describe("save-conflict-protocol (W0-T5b characterization)", () => {
  it("commitMutation leaves undo depth+1; flushSave(ok) keeps it at +1 and bumps pageVersion", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 7);
    sim.commitMutation(T("v1"));
    assert.equal(sim.past.length, 1);
    sim.flushSave("ok");
    assert.equal(sim.past.length, 1, "ok keeps the entry");
    assert.equal(sim.pageVersion, 8, "ok bumps pageVersion");
    assert.equal(sim.present.tag, "v1");
    assert.equal(sim.lastConfirmedTree.tag, "v1", "ok advances lastConfirmedTree");
    assert.equal(sim.saving, false);
  });

  it("flushSave(conflict) rolls back present to the rollback target AND pops the burst's undo entries (depth returns to baseline)", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 3);
    sim.commitMutation(T("v1"));
    assert.equal(sim.past.length, 1);
    sim.flushSave("conflict");
    // Real flushBuilderTreeSave pops burstHistoryCount entries on failure
    // (:4121-4123) so the undo stack matches the last-confirmed tree.
    assert.equal(sim.past.length, 0, "burst entry popped on conflict");
    assert.equal(sim.present.tag, "v0", "present rolled back to lastConfirmedTree");
    assert.equal(sim.pageVersion, 3, "pageVersion unchanged on conflict");
  });

  it("flushSave(conflict) sets saving=false (no stuck spinner) and fires exactly one refreshComposition", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 1);
    sim.commitMutation(T("v1"));
    sim.flushSave("conflict");
    assert.equal(sim.saving, false);
    assert.equal(sim.refreshCompositions, 1, "VERSION_CONFLICT triggers exactly one refresh");
  });

  it("flushSave(network) rolls back present and does NOT call refreshComposition (transient error keeps editor state)", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 1);
    sim.commitMutation(T("v1"));
    sim.flushSave("network");
    assert.equal(sim.present.tag, "v0", "network failure rolls back");
    assert.equal(sim.saving, false);
    assert.equal(sim.refreshCompositions, 0, "network failure must NOT wipe history via refresh");
  });

  it("burst: TWO commits then ONE flush (debounce coalesced) — rollbackTarget is lastConfirmedTree, not the first optimistic tree", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 5);
    sim.commitMutation(T("v1"));
    sim.commitMutation(T("v2")); // debounce re-armed; only the last tree (v2) is owed
    assert.equal(sim.past.length, 2, "two optimistic entries queued");
    assert.equal(sim.pendingTree?.tag, "v2", "only the final tree is pending");

    sim.flushSave("conflict");
    // On a coalesced-save conflict, BOTH burst entries are popped and present
    // reverts to v0 (lastConfirmedTree) — NOT to v1 (the first optimistic tree).
    assert.equal(sim.past.length, 0, "both burst entries popped");
    assert.equal(sim.present.tag, "v0", "rollback target = lastConfirmedTree (v0)");
  });

  it("burst that SUCCEEDS keeps both entries and advances pageVersion + lastConfirmedTree once", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 5);
    sim.commitMutation(T("v1"));
    sim.commitMutation(T("v2"));
    sim.flushSave("ok");
    assert.equal(sim.past.length, 2, "both entries survive a successful coalesced save");
    assert.equal(sim.present.tag, "v2");
    assert.equal(sim.lastConfirmedTree.tag, "v2");
    assert.equal(sim.pageVersion, 6, "one server round-trip → one version bump");
  });

  it("a no-op commit (identical tree) pushes nothing and owes no save", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 2);
    sim.commitMutation(T("v0"));
    assert.equal(sim.past.length, 0);
    assert.equal(sim.pendingTree, null);
    // flushSave with nothing pending is a clean no-op.
    sim.flushSave("ok");
    assert.equal(sim.pageVersion, 2);
  });
});
