/**
 * Theme releases Phase 2: the history writer + draft_rev optimistic concurrency.
 * The fake RPC mirrors `talent_site_write_draft` / `talent_site_history_append`
 * (migration 20261231299550): CAS on draft_rev, nothing lands on a mismatch,
 * edits fold into one entry per 60 s window.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  historyEntryPayload,
  recordSiteHistory,
  writeSiteDraft,
  type HistoryRpcClient,
} from "./writer";
import type { HistoryEntryInput } from "./types";

interface FakeEntry {
  id: string;
  kind: string;
  actor: string;
  lastAt: number;
  editCount: number;
  undoable: boolean;
}

/** In-memory model of the two RPCs (the SQL contract, not the SQL). */
function fakeDb(start = 0) {
  const state = {
    rev: start,
    shell: [] as unknown[],
    pages: new Map<string, unknown>([["p1", []]]),
    history: [] as FakeEntry[],
    now: 1_000_000,
    calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  };
  const append = (entry: Record<string, unknown>): string => {
    const batch = Number(entry.batch_seconds ?? 0);
    const last = state.history[state.history.length - 1];
    if (
      batch > 0 &&
      last &&
      last.kind === entry.kind &&
      last.actor === (entry.actor ?? "talent") &&
      last.lastAt > state.now - batch * 1000
    ) {
      last.lastAt = state.now;
      last.editCount += 1;
      return last.id;
    }
    const id = `h${state.history.length + 1}`;
    state.history.push({
      id,
      kind: String(entry.kind),
      actor: String(entry.actor ?? "talent"),
      lastAt: state.now,
      editCount: 1,
      undoable: Boolean(entry.undoable),
    });
    if (typeof entry.undo_of === "string") {
      const target = state.history.find((h) => h.id === entry.undo_of);
      if (target) target.undoable = false;
    }
    return id;
  };
  const client: HistoryRpcClient = {
    async rpc(fn, args) {
      state.calls.push({ fn, args });
      if (fn === "talent_site_history_append") {
        return { data: append(args.p_entry as Record<string, unknown>), error: null };
      }
      if (fn !== "talent_site_write_draft") return { data: null, error: { message: "unknown fn" } };
      if (args.p_site_id !== "site-1") return { data: { ok: false, code: "site_not_found" }, error: null };
      const expected = args.p_expected_rev as number | null;
      if (expected !== null && expected !== state.rev) {
        return { data: { ok: false, code: "conflict", current_rev: state.rev }, error: null };
      }
      for (const p of (args.p_pages as Array<{ id?: string }>) ?? []) {
        if (p.id && !state.pages.has(p.id)) {
          return { data: null, error: { code: "P0002", message: "talent_site_write_draft: page not found (x)" } };
        }
      }
      state.rev += 1;
      const site = (args.p_site ?? {}) as { shell_tree?: unknown[] };
      if (site.shell_tree) state.shell = site.shell_tree;
      for (const p of (args.p_pages as Array<{ id: string; patch: { blocks?: unknown } }>) ?? []) {
        if (p.patch.blocks !== undefined) state.pages.set(p.id, p.patch.blocks);
      }
      const hist = args.p_history ? append(args.p_history as Record<string, unknown>) : null;
      return { data: { ok: true, draft_rev: state.rev, history_id: hist, updated_at: "2026-09-30T00:00:00Z" }, error: null };
    },
  };
  return { state, client };
}

const edit: HistoryEntryInput = { kind: "edit", summaryEn: "Edited", summaryEs: "Editaste" };

test("payload: edits and colours batch per 60 s by default; other kinds never batch", () => {
  assert.equal(historyEntryPayload(edit).batch_seconds, 60);
  assert.equal(historyEntryPayload({ ...edit, kind: "colors" }).batch_seconds, 60);
  assert.equal(historyEntryPayload({ ...edit, kind: "publish" }).batch_seconds, 0);
  assert.equal(historyEntryPayload({ ...edit, kind: "design_apply" }).batch_seconds, 0);
  assert.equal(historyEntryPayload({ ...edit, batchSeconds: 0 }).batch_seconds, 0);
});

test("payload: defaults actor talent + draft source, carries optional fields only when set", () => {
  const p = historyEntryPayload(edit);
  assert.equal(p.actor, "talent");
  assert.equal(p.source, "draft");
  assert.equal("report" in p, false);
  assert.equal("undo_of" in p, false);
  const q = historyEntryPayload({ ...edit, kind: "theme_update", report: { a: 1 }, undoable: true, undoOf: "h1", sourceRef: "x:1", at: "2026-01-01T00:00:00Z" });
  assert.deepEqual(q.report, { a: 1 });
  assert.equal(q.undoable, true);
  assert.equal(q.undo_of, "h1");
  assert.equal(q.source_ref, "x:1");
  assert.equal(q.at, "2026-01-01T00:00:00Z");
});

test("write: a matching expected rev lands and returns the bumped rev", async () => {
  const { state, client } = fakeDb(4);
  const res = await writeSiteDraft(client, {
    siteId: "site-1",
    expectedDraftRev: 4,
    pages: [{ id: "p1", patch: { blocks: [{ id: "a" }] } }],
    history: edit,
  });
  assert.deepEqual(res.ok && res.draftRev, 5);
  assert.equal(state.rev, 5);
  assert.deepEqual(state.pages.get("p1"), [{ id: "a" }]);
  assert.equal(state.history.length, 1);
});

test("concurrency: two tabs from the same rev, the second gets a conflict and writes nothing", async () => {
  const { state, client } = fakeDb(7);
  const tabA = await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 7, pages: [{ id: "p1", patch: { blocks: ["A"] } }], history: edit });
  const tabB = await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 7, pages: [{ id: "p1", patch: { blocks: ["B"] } }], history: edit });
  assert.equal(tabA.ok, true);
  assert.equal(tabB.ok, false);
  assert.equal(!tabB.ok && tabB.code, "conflict");
  assert.equal(!tabB.ok && tabB.code === "conflict" && tabB.currentRev, 8);
  assert.equal(!tabB.ok && tabB.error, "Updated in another tab · Reload");
  // Never a silent overwrite: tab A's body stands.
  assert.deepEqual(state.pages.get("p1"), ["A"]);
  assert.equal(state.rev, 8);
});

test("concurrency: after reloading (fresh rev) the second tab's write lands", async () => {
  const { state, client } = fakeDb(1);
  await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 1, site: { shell_tree: ["A"] } });
  const stale = await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 1, site: { shell_tree: ["B"] } });
  assert.equal(stale.ok, false);
  const reloaded = await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 2, site: { shell_tree: ["B"] } });
  assert.equal(reloaded.ok, true);
  assert.deepEqual(state.shell, ["B"]);
});

test("concurrency: a system writer (no expected rev) is never race-checked", async () => {
  const { client } = fakeDb(9);
  const res = await writeSiteDraft(client, { siteId: "site-1", site: {} });
  assert.equal(res.ok && res.draftRev, 10);
});

test("write: the RPC receives null (not undefined) for a missing expected rev", async () => {
  const { state, client } = fakeDb(0);
  await writeSiteDraft(client, { siteId: "site-1" });
  assert.equal(state.calls[0]!.args.p_expected_rev, null);
  assert.deepEqual(state.calls[0]!.args.p_pages, []);
  assert.equal(state.calls[0]!.args.p_history, null);
});

test("write: unknown site and missing page map to typed failures", async () => {
  const { client } = fakeDb(0);
  const noSite = await writeSiteDraft(client, { siteId: "nope" });
  assert.equal(!noSite.ok && noSite.code, "site_not_found");
  const noPage = await writeSiteDraft(client, { siteId: "site-1", pages: [{ id: "ghost", patch: { blocks: [] } }] });
  assert.equal(!noPage.ok && noPage.code, "page_not_found");
});

test("batching: edits inside 60 s fold into one entry; a publish or a gap starts a new one", async () => {
  const { state, client } = fakeDb(0);
  for (let i = 0; i < 3; i += 1) {
    await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: state.rev, history: edit });
    state.now += 20_000;
  }
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0]!.editCount, 3);
  await recordSiteHistory(client, "site-1", { kind: "publish", summaryEn: "P", summaryEs: "P" });
  await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: state.rev, history: edit });
  assert.equal(state.history.length, 3);
  state.now += 61_000;
  await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: state.rev, history: edit });
  assert.equal(state.history.length, 4);
});

test("batching: an edit never folds into a colours entry (kinds stay apart)", async () => {
  const { state, client } = fakeDb(0);
  await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 0, history: { ...edit, kind: "colors" } });
  await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 1, history: edit });
  assert.deepEqual(state.history.map((h) => h.kind), ["colors", "edit"]);
});

test("recordSiteHistory: best-effort, an error or a throw resolves to null", async () => {
  const failing: HistoryRpcClient = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
  assert.equal(await recordSiteHistory(failing, "s", edit), null);
  const throwing: HistoryRpcClient = {
    rpc: () => {
      throw new Error("network");
    },
  };
  assert.equal(await recordSiteHistory(throwing, "s", edit), null);
  const ok: HistoryRpcClient = { rpc: async () => ({ data: "h9", error: null }) };
  assert.equal(await recordSiteHistory(ok, "s", edit), "h9");
});

test("undo_of: the undo entry marks the original update as no longer undoable", async () => {
  const { state, client } = fakeDb(0);
  await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 0, history: { ...edit, kind: "theme_update", undoable: true } });
  assert.equal(state.history[0]!.undoable, true);
  await writeSiteDraft(client, { siteId: "site-1", expectedDraftRev: 1, history: { ...edit, kind: "theme_update", undoOf: "h1" } });
  assert.equal(state.history[0]!.undoable, false);
});
