/**
 * TUL-1378 (slice 2): over its plan cap, a workspace's public roster shows the
 * people the OWNER picked (agency_visibility 'featured'), then the longest-standing
 * members. The rest are hidden from the public directory, never removed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { visibleRosterIdsWithinCap } from "./roster-visibility";

type Row = Record<string, unknown>;

function fake(rows: Row[], error = false) {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
    in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
    then: (res: (v: { data: Row[] | null; error: unknown }) => unknown) => Promise.resolve(error ? { data: null, error: { message: "x" } } : { data: rows, error: null }).then(res),
  });
  return { from: () => q } as never;
}

const roster = (n: number, featured: string[] = []): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    tenant_id: "t1", talent_profile_id: `p${i + 1}`, status: "active",
    agency_visibility: featured.includes(`p${i + 1}`) ? "featured" : "site_visible",
    added_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  }));
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

test("within the cap (or unlimited) nothing is restricted", async () => {
  assert.equal(await visibleRosterIdsWithinCap(fake(roster(5)), "t1", ids(5), 5), null);
  assert.equal(await visibleRosterIdsWithinCap(fake(roster(40)), "t1", ids(40), null), null);
});

test("over the cap: the owner's featured picks stay, then the longest-standing; extras are hidden", async () => {
  const visible = await visibleRosterIdsWithinCap(fake(roster(8, ["p7", "p8"])), "t1", ids(8), 5);
  assert.deepEqual([...visible!].sort(), ["p1", "p2", "p3", "p7", "p8"]);
});

test("with no picks the longest-standing members stay (join order)", async () => {
  const visible = await visibleRosterIdsWithinCap(fake(roster(8)), "t1", ids(8), 5);
  assert.deepEqual([...visible!].sort(), ["p1", "p2", "p3", "p4", "p5"]);
});

test("a read error keeps the old behaviour (null = no restriction here; the offset cap still applies)", async () => {
  assert.equal(await visibleRosterIdsWithinCap(fake(roster(8), true), "t1", ids(8), 5), null);
});

test("wiring: the directory restricts its tenant roster to the visible set when over the cap", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/directory/fetch-directory-page.ts"), "utf8");
  assert.match(src, /visibleRosterIdsWithinCap\(supabase, tenantScopeId, rosterIds, tenantRosterDisplayCap\)/);
});
