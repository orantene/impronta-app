/**
 * P0 (QA NO-GO on da79c6b9): the Concierge dock listed other tenants' services and
 * talent. These tests seed TWO tenants in an in-memory admin client and prove the
 * catalog readers only ever return the asked-for tenant's rows, and that a
 * per-talent page narrows further to that talent. No database is touched.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadOfferingRows, loadTalentProfileOfferingRows, pickScopedTalentId } from "./items-catalog";
import { scopeRosterToTalent } from "@/lib/inquiry/roster-scope";

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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { offeringsTenantScope } from "@/lib/inquiry/roster-scope";

// TUL-1070: andres-cocina-demo showed 'Sesión de retrato QA' / 'Limpieza profunda' from other tenants.
const ANDRES = {
  talent_offerings: [
    offering("c1", "tenant-andres", "talent-andres", "Menú del día"),
    offering("c2", "tenant-andres", "talent-andres", "Cata de vinos"),
    offering("x1", "tenant-qa", "talent-andres", "Sesión de retrato QA"),
    offering("x2", "tenant-cleaning", "talent-andres", "Limpieza profunda"),
    offering("x3", "tenant-qa", "talent-other", "Other talent"),
  ],
};

test("TUL-1070: the same talent on three tenants lists only the current tenant's services", async () => {
  const rows = await loadTalentProfileOfferingRows(fakeAdmin(ANDRES), "tenant-andres", "talent-andres");
  assert.deepEqual(rows.map((r) => r.title).sort(), ["Cata de vinos", "Menú del día"]);
  for (const other of ["tenant-qa", "tenant-cleaning"]) {
    const o = await loadOfferingRows(fakeAdmin(ANDRES), other);
    assert.ok(o.every((r) => r.title !== "Menú del día" && r.title !== "Cata de vinos"));
  }
  const all = await loadOfferingRows(fakeAdmin(ANDRES), "tenant-andres");
  assert.ok(all.every((r) => !/QA|Limpieza/.test(r.title)), "no other tenant's service may appear");
});

test("TUL-1070: the dock reads a talent's offerings under the current tenant; only a hub reads unscoped", () => {
  assert.equal(offeringsTenantScope("agency", "tenant-andres"), "tenant-andres");
  assert.equal(offeringsTenantScope(null, "tenant-andres"), "tenant-andres");
  assert.equal(offeringsTenantScope("hub", "hub-1"), null);
  assert.equal(offeringsTenantScope("agency", null), null);
});

test("TUL-1070: the launcher mount never loads offerings without the tenant scope", () => {
  const src = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx"), "utf8");
  assert.match(src, /loadPublicOfferingsForProfile\(talentProfileId, locale \?\? "en", offeringsTenantId\)/);
  assert.doesNotMatch(src, /loadPublicOfferingsForProfile\(talentProfileId, locale \?\? "en"\)/);
});
