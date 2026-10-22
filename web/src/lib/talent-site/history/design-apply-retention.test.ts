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
import { planRestore } from "./restore-plan";
import type { HistorySnapshot } from "./types";

type Row = { id: string; site_id: string; talent_profile_id: string; kind: string; at: number };

/** Minimal in-memory talent_site_history honouring the filters the prune uses. */
function fakeAdmin(rows: Row[], opts: { failSelect?: boolean; failDelete?: boolean } = {}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, "talent_site_history");
      const eq: Array<[string, unknown]> = [];
      let inIds: string[] | null = null;
      let mode: "select" | "delete" = "select";
      let range: [number, number] = [0, 1000];
      const matches = () =>
        rows.filter((r) => eq.every(([k, v]) => (r as Record<string, unknown>)[k] === v) && (!inIds || inIds.includes(r.id)));
      const q: Record<string, unknown> = {
        select: () => q,
        delete: () => {
          mode = "delete";
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
          calls.push("delete");
          if (opts.failDelete) return resolve({ data: null, error: { message: "boom" } });
          for (const r of matches()) rows.splice(rows.indexOf(r), 1);
          resolve({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return { admin: client as unknown as SupabaseClient, calls };
}

const rowsFor = (site: string, n: number, kind = "design_apply"): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${site}-${kind}-${i}`, site_id: site, talent_profile_id: `p-${site}`, kind, at: i }));

test("default cap is 10", () => {
  assert.equal(DESIGN_APPLY_SNAPSHOT_KEEP, 10);
});

test("prune keeps the newest N design_apply rows for the site and deletes older ones", async () => {
  const rows = rowsFor("s1", 14);
  const { admin } = fakeAdmin(rows);
  const res = await pruneDesignApplySnapshots(admin, { siteId: "s1", talentProfileId: "p-s1" });
  assert.deepEqual(res, { ok: true, deleted: 4 });
  const left = rows.map((r) => r.at).sort((a, b) => a - b);
  assert.deepEqual(left, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test("prune never touches other sites or other history kinds", async () => {
  const rows = [...rowsFor("s1", 12), ...rowsFor("s2", 12), ...rowsFor("s1", 30, "edit")];
  const { admin } = fakeAdmin(rows);
  await pruneDesignApplySnapshots(admin, { siteId: "s1", talentProfileId: "p-s1", keep: 3 });
  assert.equal(rows.filter((r) => r.site_id === "s1" && r.kind === "design_apply").length, 3);
  assert.equal(rows.filter((r) => r.site_id === "s2").length, 12);
  assert.equal(rows.filter((r) => r.kind === "edit").length, 30);
});

test("under the cap deletes nothing and issues no delete", async () => {
  const rows = rowsFor("s1", 10);
  const { admin, calls } = fakeAdmin(rows);
  assert.deepEqual(await pruneDesignApplySnapshots(admin, { siteId: "s1", talentProfileId: "p-s1" }), { ok: true, deleted: 0 });
  assert.deepEqual(calls, ["select"]);
});

test("query errors are reported as not ok and nothing is deleted", async () => {
  const rows = rowsFor("s1", 15);
  assert.deepEqual(
    await pruneDesignApplySnapshots(fakeAdmin(rows, { failSelect: true }).admin, { siteId: "s1", talentProfileId: "p-s1" }),
    { ok: false },
  );
  assert.deepEqual(
    await pruneDesignApplySnapshots(fakeAdmin(rows, { failDelete: true }).admin, { siteId: "s1", talentProfileId: "p-s1" }),
    { ok: false },
  );
  assert.equal(rows.length, 15);
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
