/**
 * P0 (QA NO-GO on da79c6b9): the Concierge dock listed other tenants' services and
 * talent. These tests seed TWO tenants in an in-memory admin client and prove the
 * catalog readers only ever return the asked-for tenant's rows, and that a
 * per-talent page narrows further to that talent. No database is touched.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadOfferingRows, loadTalentProfileOfferingRows, loadTalentRows, pickScopedTalentId } from "./items-catalog";
import { narrowTalentForTenant, scopeRosterToTalent } from "@/lib/inquiry/roster-scope";

type Row = Record<string, unknown>;

/** Minimal Supabase-shaped fake: eq / neq / in / is / order / limit over in-memory tables. */
function fakeAdmin(tables: Record<string, Row[]>) {
  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), q),
      neq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] !== v)), q),
      in: (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), q),
      is: (col: string, v: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === v)), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  }
  return { from: (table: string) => query(table) } as never;
}

const offering = (id: string, tenant: string, talent: string, title: string, kind = "service"): Row => ({
  id, tenant_id: tenant, talent_profile_id: talent, title, kind,
  amount_cents: 5000, currency: "USD", status: "published", moderation_state: "approved",
  visibility: "public", inventory_qty: null, capacity_pool_id: null, duration_minutes: 60, sort_order: 1,
});

const TABLES = {
  talent_offerings: [
    offering("a1", "tenant-a", "talent-a1", "A: Manicure"),
    offering("a2", "tenant-a", "talent-a2", "A: Pedicure"),
    offering("b1", "tenant-b", "talent-b1", "B: Portrait"),
    offering("b2", "tenant-b", "talent-b2", "B: Cleaning", "package"),
  ],
};

test("tenant A's services never include tenant B's", async () => {
  const rows = await loadOfferingRows(fakeAdmin(TABLES), "tenant-a");
  assert.deepEqual(rows.map((r) => r.title).sort(), ["A: Manicure", "A: Pedicure"]);
  assert.ok(rows.every((r) => !r.title.startsWith("B:")));
});

test("tenant B's services never include tenant A's", async () => {
  const rows = await loadOfferingRows(fakeAdmin(TABLES), "tenant-b");
  assert.deepEqual(rows.map((r) => r.title).sort(), ["B: Cleaning", "B: Portrait"]);
});

test("a per-talent page lists only that talent, even inside its own tenant", async () => {
  const rows = await loadTalentProfileOfferingRows(fakeAdmin(TABLES), "tenant-a", "talent-a1");
  assert.deepEqual(rows.map((r) => r.title), ["A: Manicure"]);
});

test("asking for tenant A with tenant B's talent returns nothing (no cross-tenant read)", async () => {
  const rows = await loadTalentProfileOfferingRows(fakeAdmin(TABLES), "tenant-a", "talent-b1");
  assert.equal(rows.length, 0);
});

test("the page's talent always wins; otherwise a single-talent conversation scopes; otherwise the tenant", () => {
  assert.equal(pickScopedTalentId({ forcedTalentId: "t1", talentOwned: false, contextTalentIds: [] }), "t1");
  assert.equal(pickScopedTalentId({ forcedTalentId: null, talentOwned: true, contextTalentIds: ["t2"] }), "t2");
  assert.equal(pickScopedTalentId({ forcedTalentId: null, talentOwned: true, contextTalentIds: ["t2", "t3"] }), null);
  assert.equal(pickScopedTalentId({ forcedTalentId: null, talentOwned: false, contextTalentIds: ["t2"] }), null);
});

test("the talent picker on a talent's page lists only that talent", () => {
  const roster = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];
  assert.deepEqual(scopeRosterToTalent(roster, "t2"), [{ id: "t2" }]);
  assert.equal(scopeRosterToTalent(roster, null).length, 3);
  assert.equal(scopeRosterToTalent(roster, "not-on-this-roster").length, 0);
});

const ROSTER = {
  agency_talent_roster: [
    { tenant_id: "agency-a", status: "active", talent_profile_id: "ta1", talent_profiles: { id: "ta1", profile_code: "TAL-A1", display_name: "A One" } },
    { tenant_id: "agency-a", status: "active", talent_profile_id: "ta2", talent_profiles: { id: "ta2", profile_code: "TAL-A2", display_name: "A Two" } },
    { tenant_id: "agency-b", status: "active", talent_profile_id: "tb1", talent_profiles: { id: "tb1", profile_code: "TAL-B1", display_name: "B One" } },
  ],
  ...TABLES,
};

test("an agency page lists its own roster and zero talent from any other tenant", async () => {
  const rows = await loadTalentRows(fakeAdmin(ROSTER), "agency-a", null, new Date());
  assert.deepEqual(rows.map((r) => r.title).sort(), ["A One", "A Two"]);
  assert.ok(rows.every((r) => r.talentProfileId?.startsWith("ta")));
});

test("an agency page lists its own services and none from another tenant", async () => {
  const rows = await loadOfferingRows(fakeAdmin(ROSTER), "tenant-a");
  assert.ok(rows.length > 0 && rows.every((r) => r.title.startsWith("A:")));
});

test("only a hub narrows a talent page to one talent; an agency keeps its roster", () => {
  assert.equal(narrowTalentForTenant("hub", "t1"), "t1");
  assert.equal(narrowTalentForTenant("agency", "t1"), null);
  assert.equal(narrowTalentForTenant(null, "t1"), null);
  assert.equal(narrowTalentForTenant("hub", null), null);
  // agency roster stays whole when nothing narrows it
  assert.equal(scopeRosterToTalent([{ id: "ta1" }, { id: "ta2" }], narrowTalentForTenant("agency", "ta1")).length, 2);
});
