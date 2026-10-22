/**
 * TUL-527: design_apply snapshot retention + the A to B to C chain it protects.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { propsOf, refreshOriginFingerprints, stampDesignOrigin } from "@/lib/talent-site/theme-releases/origin";
import { built } from "@/lib/talent-site/theme-releases/test-fixtures";
import { planDesignSwitch } from "@/lib/talent-site/server/design-switch";
import { DESIGN_APPLY_SNAPSHOT_KEEP, pruneDesignApplySnapshots } from "./design-apply-retention";
import { isHistorySnapshot, planRestore } from "./restore-plan";
import { mapHistoryRowsToRevisions } from "./timeline";
import type { HistoryRow } from "./types";
import type { HistorySnapshot } from "./types";

type Row = {
  id: string;
  site_id: string;
  talent_profile_id: string;
  kind: string;
  at: number;
  snapshot_ref: unknown;
  undoable: boolean;
};

/** Minimal in-memory talent_site_history honouring the filters the prune uses. */
function fakeAdmin(rows: Row[], opts: { failSelect?: boolean; failDelete?: boolean } = {}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, "talent_site_history");
      const eq: Array<[string, unknown]> = [];
      let inIds: string[] | null = null;
      let mode: "select" | "update" = "select";
      let patch: Record<string, unknown> = {};
      let notNull: string | null = null;
      let range: [number, number] = [0, 1000];
      const matches = () =>
        rows.filter(
          (r) =>
            eq.every(([k, v]) => (r as Record<string, unknown>)[k] === v) &&
            (!inIds || inIds.includes(r.id)) &&
            (!notNull || (r as Record<string, unknown>)[notNull] !== null),
        );
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Record<string, unknown>) => {
          mode = "update";
          patch = p;
          return q;
        },
        not: (k: string, op: string, v: unknown) => {
          assert.equal(op, "is");
          assert.equal(v, null);
          notNull = k;
          return q;
        },
        eq: (k: string, v: unknown) => {
          eq.push([k, v]);
          return q;
        },
        in: (_k: string, ids: string[]) => {
          inIds = ids;
          return q;
        },
        order: () => q,
        range: (a: number, b: number) => {
          range = [a, b];
          return q;
        },
        then: (resolve: (v: unknown) => void) => {
          if (mode === "select") {
            calls.push("select");
            if (opts.failSelect) return resolve({ data: null, error: { message: "boom" } });
            const sorted = matches().sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
            return resolve({ data: sorted.slice(range[0], range[1] + 1).map((r) => ({ id: r.id })), error: null });
          }
          calls.push("update");
          if (opts.failDelete) return resolve({ data: null, error: { message: "boom" } });
          for (const r of matches()) Object.assign(r, patch);
          resolve({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return { admin: client as unknown as SupabaseClient, calls };
}

const rowsFor = (site: string, n: number, kind = "design_apply"): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${site}-${kind}-${i}`, site_id: site, talent_profile_id: `p-${site}`, kind, at: i, snapshot_ref: { v: 1 }, undoable: true }));

test("default cap is 10", () => {
  assert.equal(DESIGN_APPLY_SNAPSHOT_KEEP, 10);
});

test("prune keeps the newest N snapshots, clears older payloads and keeps every timeline row", async () => {
  const rows = rowsFor("s1", 14);
  const { admin } = fakeAdmin(rows);
  const res = await pruneDesignApplySnapshots(admin, { siteId: "s1", talentProfileId: "p-s1" });
  assert.deepEqual(res, { ok: true, cleared: 4 });
  assert.equal(rows.length, 14, "no row is deleted");
  const kept = rows.filter((r) => r.snapshot_ref !== null).map((r) => r.at).sort((a, b) => a - b);
  assert.deepEqual(kept, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  for (const r of rows.filter((x) => x.at < 4)) {
    assert.equal(r.snapshot_ref, null);
    assert.equal(r.undoable, false, "Undo is disabled once the snapshot is gone");
  }
  for (const r of rows.filter((x) => x.at >= 4)) assert.equal(r.undoable, true);
  // A second prune has nothing left to clear.
  assert.deepEqual(await pruneDesignApplySnapshots(admin, { siteId: "s1", talentProfileId: "p-s1" }), { ok: true, cleared: 0 });
});

test("prune never touches other sites or other history kinds", async () => {
  const rows = [...rowsFor("s1", 12), ...rowsFor("s2", 12), ...rowsFor("s1", 30, "edit")];
  const { admin } = fakeAdmin(rows);
  await pruneDesignApplySnapshots(admin, { siteId: "s1", talentProfileId: "p-s1", keep: 3 });
  const live = (f: (r: Row) => boolean) => rows.filter((r) => f(r) && r.snapshot_ref !== null).length;
  assert.equal(live((r) => r.site_id === "s1" && r.kind === "design_apply"), 3);
  assert.equal(live((r) => r.site_id === "s2"), 12);
  assert.equal(live((r) => r.kind === "edit"), 30);
  assert.equal(rows.filter((r) => r.kind === "edit" && !r.undoable).length, 0);
});

test("under the cap clears nothing and issues no update", async () => {
  const rows = rowsFor("s1", 10);
  const { admin, calls } = fakeAdmin(rows);
  assert.deepEqual(await pruneDesignApplySnapshots(admin, { siteId: "s1", talentProfileId: "p-s1" }), { ok: true, cleared: 0 });
  assert.deepEqual(calls, ["select"], "no update issued");
});

test("query errors are reported as not ok and nothing is cleared", async () => {
  const rows = rowsFor("s1", 15);
  assert.deepEqual(
    await pruneDesignApplySnapshots(fakeAdmin(rows, { failSelect: true }).admin, { siteId: "s1", talentProfileId: "p-s1" }),
    { ok: false },
  );
  assert.deepEqual(
    await pruneDesignApplySnapshots(fakeAdmin(rows, { failDelete: true }).admin, { siteId: "s1", talentProfileId: "p-s1" }),
    { ok: false },
  );
  assert.equal(rows.filter((r) => r.snapshot_ref !== null).length, 15);
});

function stampAs(side: ReturnType<typeof built>, design: string) {
  const src = { design, version: 1 };
  return {
    shell: refreshOriginFingerprints(stampDesignOrigin(side.trees.shell!, src)),
    home: refreshOriginFingerprints(stampDesignOrigin(side.trees.home!, src)),
  };
}

test("A to B to C leaves no stacked blocks and undoing C restores B's pre-switch draft", () => {
  const a = stampAs(built(1, { withGallery: true }), "maison-v2");
  const b = stampAs(built(2, { withGallery: false }), "gridline");
  const c = stampAs(built(3, { withGallery: false }), "folio");
  const sw = (from: typeof a, to: typeof a, f: string, t: string) =>
    planDesignSwitch({ fromShell: from.shell, fromHome: from.home, toShell: to.shell, toHome: to.home, fromSlug: f, toSlug: t, fromVersion: 1, toVersion: 1 });
  const ab = sw(a, b, "maison-v2", "gridline");
  const bc = sw(ab, c, "gridline", "folio");
  assert.equal(bc.home.length, c.home.length);
  for (const n of bc.home) {
    const d = (propsOf(n).__origin as { design?: string } | undefined)?.design;
    if (d) assert.equal(d, "folio");
  }
  // The snapshot written with the B to C switch is the draft as it was on B.
  const snapshot: HistorySnapshot = {
    v: 1,
    source: "draft",
    rev: 2,
    shell: ab.shell,
    tokens: {},
    design: { slug: "gridline", version: 1, look: null },
    pages: { home: ab.home },
  };
  const undo = planRestore(snapshot, { shell: bc.shell, pages: { home: bc.home } });
  assert.deepEqual(undo.site.shell_tree, ab.shell);
  assert.equal(undo.site.theme_design_slug, "gridline");
  assert.deepEqual(undo.pages[0], { id: "home", patch: { blocks: ab.home } });
});

test("a pruned entry stays on the timeline with Undo off, and its null snapshot is not restorable", () => {
  const row = (undoable: boolean): HistoryRow => ({
    id: "h1",
    site_id: "s1",
    talent_profile_id: "p1",
    at: "2026-10-22T10:00:00Z",
    last_at: "2026-10-22T10:00:00Z",
    actor: "talent",
    kind: "design_apply",
    summary_en: "Applied a design",
    summary_es: "Aplicaste un diseno",
    report: null,
    undoable,
    draft_rev: 3,
    edit_count: 1,
    created_by: null,
  });
  const target = { siteBasePath: "/t/site/x", pageSlug: null };
  const [live] = mapHistoryRowsToRevisions([row(true)], target);
  const [pruned] = mapHistoryRowsToRevisions([row(false)], target);
  assert.equal(live!.history?.undoable, true);
  assert.equal(pruned!.history?.undoable, false);
  assert.equal(isHistorySnapshot(null), false, "undo refuses a row whose snapshot is gone");
});
