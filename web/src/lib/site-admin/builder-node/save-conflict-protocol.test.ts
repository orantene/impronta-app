/**
 * save-conflict-protocol.test.ts — Marathon W0-T5(b), updated for W1-L2.
 *
 * The save / version-conflict path lives inside `edit-context.tsx`
 * (commitBuilderTreeMutation → debounce → flushBuilderTreeSave →
 * persistBuilderTree) and cannot be imported without a DOM and a mocked
 * server action. So this file pins the CONTRACT against a faithful
 * state-machine simulator (`BuilderSaveSimulator`) that mirrors the production
 * closures exactly:
 *
 *   - commitMutation(next)      mirrors commitBuilderTreeMutation: optimistic
 *                               apply, push ONE undo entry, bump
 *                               pendingHistoryCount, arm debounce, dirty=true.
 *   - flushSave(outcome)        mirrors flushBuilderTreeSave: rollback target =
 *                               lastConfirmedTree, capture burst history count,
 *                               run persist. W1-L2 — a VERSION_CONFLICT result
 *                               pops NOTHING (the operator's edits stay live
 *                               while the conflict banner offers the choice);
 *                               only non-conflict failures pop the burst.
 *   - persist                   mirrors persistBuilderTree: ok → bump
 *                               pageVersion, set lastConfirmedTree,
 *                               saving=false. W1-L2 — VERSION_CONFLICT keeps
 *                               the local tree applied (NO rollback), parks it,
 *                               and does NOT auto-refresh (no silent undo
 *                               wipe); network → revert, saving=false, NO
 *                               refresh (unchanged).
 *   - reloadLatest()            mirrors reloadLatestAfterConflict: refresh
 *                               (undo reset, explained) + clear the parked tree.
 *   - keepMine()                mirrors keepMyVersionAfterConflict: version-only
 *                               refresh + re-persist the local tree; undo intact.
 *
 * These assertions are the seatbelt the eventual context split must not break.
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

  /** W1-L2 — mirrors conflictRecoveryTreeRef + hasConflictRecovery. */
  conflictParked: Tree | null = null;

  /** mirrors flushBuilderTreeSave + the persist it enqueues. */
  flushSave(outcome: SaveOutcome): void {
    const pending = this.pendingTree;
    if (pending === null) return; // nothing owed
    this.pendingTree = null;
    const rollbackTarget = this.lastConfirmedTree; // NOT the latest optimistic tree
    const burstHistoryCount = this.pendingHistoryCount;
    this.pendingHistoryCount = 0;

    const result = this.persist(pending, rollbackTarget, outcome);

    // W1-L2 — a conflict keeps the burst's edits + undo entries live while the
    // banner offers the resolution; the flush handler returns early for it.
    if (!result.ok && result.code === "VERSION_CONFLICT") return;

    if (!result.ok && burstHistoryCount > 0) {
      // Roll back every optimistic history entry queued during this burst
      // so undo depth matches the last-confirmed tree.
      this.past = this.past.slice(0, this.past.length - burstHistoryCount);
    }
  }

  /** mirrors persistBuilderTree. */
  private persist(
    nextTree: Tree,
    rollbackTarget: Tree | undefined,
    outcome: SaveOutcome,
  ): { ok: boolean; code?: "VERSION_CONFLICT" | "network" } {
    const prevTree = rollbackTarget ?? this.present;
    this.present = nextTree; // optimistic
    this.saving = true;

    if (outcome === "ok") {
      this.saving = false;
      this.pageVersion += 1; // server returns a bumped version
      this.lastConfirmedTree = nextTree;
      this.conflictParked = null; // a clean save resolves any pending conflict
      return { ok: true };
    }
    this.saving = false; // runs before the branch
    if (outcome === "conflict") {
      // W1-L2 — HONEST CONFLICT PROTOCOL: keep the operator's tree applied
      // (no rollback), park it, do NOT auto-refresh (no silent undo wipe).
      this.conflictParked = nextTree;
      return { ok: false, code: "VERSION_CONFLICT" };
    }
    this.present = prevTree; // revert (non-conflict failures only)
    return { ok: false, code: "network" }; // NO refreshComposition
  }

  /** W1-L2 — mirrors reloadLatestAfterConflict. */
  reloadLatest(serverTree: Tree, serverVersion: number): void {
    this.pendingTree = null;
    this.pendingHistoryCount = 0;
    this.conflictParked = null;
    // refreshComposition: replace state + wipe history (explained via toast).
    this.refreshCompositions += 1;
    this.present = serverTree;
    this.lastConfirmedTree = serverTree;
    this.pageVersion = serverVersion;
    this.past = [];
    this.future = [];
  }

  /** W1-L2 — mirrors keepMyVersionAfterConflict (version-only refresh + re-save). */
  keepMine(serverVersion: number): void {
    if (this.conflictParked === null) return;
    const mine = this.present; // the LOCAL tree stays what the operator sees
    this.pageVersion = serverVersion; // version-only refresh (content untouched)
    // re-issue the save; the fresh CAS version succeeds
    this.persist(mine, this.lastConfirmedTree, "ok");
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

  it("W1-L2: flushSave(conflict) keeps the operator's tree applied, keeps the undo entries, parks the tree, and does NOT auto-refresh", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 3);
    sim.commitMutation(T("v1"));
    assert.equal(sim.past.length, 1);
    sim.flushSave("conflict");
    // W1-L2 honest-conflict protocol: nothing is silently reverted or wiped.
    assert.equal(sim.past.length, 1, "undo entries survive a conflict");
    assert.equal(sim.present.tag, "v1", "the operator's local tree stays applied");
    assert.equal(sim.pageVersion, 3, "pageVersion unchanged on conflict");
    assert.equal(sim.conflictParked?.tag, "v1", "the tree is parked for resolution");
    assert.equal(sim.refreshCompositions, 0, "NO auto-refresh (no silent undo wipe)");
  });

  it("flushSave(conflict) sets saving=false (no stuck spinner)", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 1);
    sim.commitMutation(T("v1"));
    sim.flushSave("conflict");
    assert.equal(sim.saving, false);
  });

  it("W1-L2: 'Reload latest' resolves the conflict by taking server state — undo reset happens HERE (user-chosen), parked tree cleared", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 3);
    sim.commitMutation(T("v1"));
    sim.flushSave("conflict");
    sim.reloadLatest(T("theirs"), 4);
    assert.equal(sim.present.tag, "theirs", "server state loaded");
    assert.equal(sim.pageVersion, 4);
    assert.equal(sim.past.length, 0, "undo reset only on the user's choice");
    assert.equal(sim.conflictParked, null, "conflict resolved");
    assert.equal(sim.refreshCompositions, 1, "exactly one refresh, user-chosen");
  });

  it("W1-L2: 'Keep editing this copy' re-saves the LOCAL tree at the fresh version — undo intact, no refresh", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 3);
    sim.commitMutation(T("v1"));
    sim.flushSave("conflict");
    sim.keepMine(4); // server is at v4 after the foreign write
    assert.equal(sim.present.tag, "v1", "the operator's copy wins");
    assert.equal(sim.pageVersion, 5, "re-save bumps past the foreign version");
    assert.equal(sim.lastConfirmedTree.tag, "v1", "local tree is now confirmed");
    assert.equal(sim.past.length, 1, "undo history intact");
    assert.equal(sim.conflictParked, null, "conflict resolved");
    assert.equal(sim.refreshCompositions, 0, "keep-mine never refreshes/wipes");
  });

  it("flushSave(network) rolls back present and does NOT call refreshComposition (transient error keeps editor state)", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 1);
    sim.commitMutation(T("v1"));
    sim.flushSave("network");
    assert.equal(sim.present.tag, "v0", "network failure rolls back");
    assert.equal(sim.saving, false);
    assert.equal(sim.refreshCompositions, 0, "network failure must NOT wipe history via refresh");
  });

  it("burst: TWO commits then ONE flush (debounce coalesced) — a NETWORK failure pops both entries and reverts to lastConfirmedTree, not the first optimistic tree", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 5);
    sim.commitMutation(T("v1"));
    sim.commitMutation(T("v2")); // debounce re-armed; only the last tree (v2) is owed
    assert.equal(sim.past.length, 2, "two optimistic entries queued");
    assert.equal(sim.pendingTree?.tag, "v2", "only the final tree is pending");

    sim.flushSave("network");
    // On a coalesced-save NON-CONFLICT failure, BOTH burst entries are popped
    // and present reverts to v0 (lastConfirmedTree) — NOT to v1 (the first
    // optimistic tree).
    assert.equal(sim.past.length, 0, "both burst entries popped");
    assert.equal(sim.present.tag, "v0", "rollback target = lastConfirmedTree (v0)");
  });

  it("W1-L2 burst conflict: BOTH entries + the coalesced tree survive; keep-mine then confirms the latest tree", () => {
    const sim = new BuilderSaveSimulator(T("v0"), 5);
    sim.commitMutation(T("v1"));
    sim.commitMutation(T("v2"));
    sim.flushSave("conflict");
    assert.equal(sim.past.length, 2, "burst entries survive the conflict");
    assert.equal(sim.present.tag, "v2", "latest local tree stays applied");
    sim.keepMine(9);
    assert.equal(sim.present.tag, "v2");
    assert.equal(sim.lastConfirmedTree.tag, "v2");
    assert.equal(sim.pageVersion, 10);
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
