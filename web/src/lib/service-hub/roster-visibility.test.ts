/**
 * TUL-1378 (slice 2): over its plan cap, a workspace's public roster shows the
 * people the OWNER picked, then the longest-standing members. The rest are hidden from
 * the public directory, never removed.
 *
 * TUL-1693: the pick is the roster's own `keep_visible`, not agency_visibility 'featured'
 * (featured is also a theme badge). Until the keep_visible migration is applied the read
 * falls back to today's behaviour: 'featured' is the pick.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { visibleRosterIdsWithinCap } from "./roster-visibility";

const ON = { HUB_PLAN_CAP_PICKS_ENABLED: "1" } as const;

type Row = Record<string, unknown>;

function fake(rows: Row[], error = false, opts: { noKeepVisibleColumn?: boolean } = {}) {
  const q: Record<string, unknown> = {};
  let missingColumn = false;
  Object.assign(q, {
    select: (cols: string) => {
      missingColumn = !!opts.noKeepVisibleColumn && cols.includes("keep_visible");
      if (opts.noKeepVisibleColumn) rows = rows.map(({ keep_visible: _k, ...rest }) => rest);
      return q;
    },
    eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
    in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
    then: (res: (v: { data: Row[] | null; error: unknown }) => unknown) =>
      Promise.resolve(
        missingColumn
          ? { data: null, error: { code: "42703", message: "column agency_talent_roster.keep_visible does not exist" } }
          : error ? { data: null, error: { message: "x" } } : { data: rows, error: null },
      ).then(res),
  });
  // a fresh query per from(), sharing the same rows
  const all = rows;
  return { from: () => ((rows = all), (missingColumn = false), q) } as never;
}

const roster = (n: number, featured: string[] = [], kept: string[] = []): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    tenant_id: "t1", talent_profile_id: `p${i + 1}`, status: "active",
    agency_visibility: featured.includes(`p${i + 1}`) ? "featured" : "site_visible",
    keep_visible: kept.includes(`p${i + 1}`),
    added_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  }));
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

test("within the cap (or unlimited) nothing is restricted", async () => {
  assert.equal(await visibleRosterIdsWithinCap(fake(roster(5)), "t1", ids(5), 5, ON), null);
  assert.equal(await visibleRosterIdsWithinCap(fake(roster(40)), "t1", ids(40), null, ON), null);
});

test("over the cap: the owner's picks (keep_visible) stay, then the longest-standing; extras are hidden", async () => {
  const visible = await visibleRosterIdsWithinCap(fake(roster(8, [], ["p7", "p8"])), "t1", ids(8), 5, ON);
  assert.deepEqual([...visible!].sort(), ["p1", "p2", "p3", "p7", "p8"]);
});

test("TUL-1693: an owner pick changes the public order; featured alone does not", async () => {
  const none = await visibleRosterIdsWithinCap(fake(roster(8)), "t1", ids(8), 5, ON);
  assert.deepEqual([...none!].sort(), ["p1", "p2", "p3", "p4", "p5"]);
  // picking p8 (keep_visible) brings p8 in and pushes the newest of the rest (p5) out
  const picked = await visibleRosterIdsWithinCap(fake(roster(8, [], ["p8"])), "t1", ids(8), 5, ON);
  assert.deepEqual([...picked!].sort(), ["p1", "p2", "p3", "p4", "p8"]);
  // featured (a theme badge) is no longer a pick once keep_visible exists
  const featuredOnly = await visibleRosterIdsWithinCap(fake(roster(8, ["p7", "p8"])), "t1", ids(8), 5, ON);
  assert.deepEqual([...featuredOnly!].sort(), ["p1", "p2", "p3", "p4", "p5"]);
});

test("TUL-1693: keep_visible not migrated yet: identical to today's 'featured' order", async () => {
  // Today's behaviour, computed with featured as the pick: p7, p8 featured -> p1 p2 p3 p7 p8.
  for (const [featured, expected] of [
    [["p7", "p8"], ["p1", "p2", "p3", "p7", "p8"]],
    [[], ["p1", "p2", "p3", "p4", "p5"]],
    [["p6"], ["p1", "p2", "p3", "p4", "p6"]],
  ] as const) {
    const visible = await visibleRosterIdsWithinCap(fake(roster(8, [...featured], ["p1"]), false, { noKeepVisibleColumn: true }), "t1", ids(8), 5, ON);
    assert.deepEqual([...visible!].sort(), [...expected], `featured=${featured.join(",")}`);
  }
});

test("TUL-1693: any other read error still means no restriction (not the fallback read)", async () => {
  assert.equal(await visibleRosterIdsWithinCap(fake(roster(8, ["p7"]), true), "t1", ids(8), 5, ON), null);
});

test("with no picks the longest-standing members stay (join order)", async () => {
  const visible = await visibleRosterIdsWithinCap(fake(roster(8)), "t1", ids(8), 5, ON);
  assert.deepEqual([...visible!].sort(), ["p1", "p2", "p3", "p4", "p5"]);
});

test("a read error keeps the old behaviour (null = no restriction here; the offset cap still applies)", async () => {
  assert.equal(await visibleRosterIdsWithinCap(fake(roster(8), true), "t1", ids(8), 5, ON), null);
});

test("wiring: the directory restricts its tenant roster to the visible set when over the cap", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/directory/fetch-directory-page.ts"), "utf8");
  assert.match(src, /visibleRosterIdsWithinCap\(supabase, tenantScopeId, rosterIds, tenantRosterDisplayCap\)/);
});

test("OFF by default: over the cap nothing changes in the public directory until the flag is on", async () => {
  const f = fake(roster(8, ["p7", "p8"], ["p7", "p8"]));
  assert.equal(await visibleRosterIdsWithinCap(f, "t1", ids(8), 5, {}), null);
  assert.equal(await visibleRosterIdsWithinCap(f, "t1", ids(8), 5, { HUB_PLAN_CAP_PICKS_ENABLED: "0" }), null);
  assert.equal(await visibleRosterIdsWithinCap(f, "t1", ids(8), 5, { HUB_PLAN_CAP_PICKS_ENABLED: "true" }), null);
});

test("a roster id the query does not return stays in the roster (counted last), it does not vanish", async () => {
  // p9 is on the roster list but missing from the rows (e.g. a non-active row): 9 ids, cap 5.
  const visible = await visibleRosterIdsWithinCap(fake(roster(8)), "t1", ids(9), 5, ON);
  assert.deepEqual([...visible!].sort(), ["p1", "p2", "p3", "p4", "p5"]);
  // With room under the cap it is kept too: 9 ids, cap 8, p9 missing from rows -> all 8 known + p9 is the 9th, hidden by the cap only.
  const wide = await visibleRosterIdsWithinCap(fake(roster(8)), "t1", ids(9), 8, ON);
  assert.equal(wide!.length, 8);
  assert.ok(!wide!.includes("p9"), "last in line, hidden only because the cap is full");
  const roomy = await visibleRosterIdsWithinCap(fake(roster(3)), "t1", ids(5), 4, ON);
  assert.deepEqual([...roomy!].sort(), ["p1", "p2", "p3", "p4"], "an id with no row fills a free seat");
});

test("a row with no added_at is treated as the newest, not the longest-standing", async () => {
  const rows = roster(6).map((r, i) => (i === 0 ? { ...r, added_at: null } : r));
  const visible = await visibleRosterIdsWithinCap(fake(rows), "t1", ids(6), 5, ON);
  assert.ok(!visible!.includes("p1"));
});
