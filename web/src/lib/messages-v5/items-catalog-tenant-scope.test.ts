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
      gte: (col: string, v: unknown) => ((rows = rows.filter((r) => String(r[col] ?? "") >= String(v))), q),
      lte: (col: string, v: unknown) => ((rows = rows.filter((r) => String(r[col] ?? "") <= String(v))), q),
      gt: (col: string, v: unknown) => ((rows = rows.filter((r) => String(r[col] ?? "") > String(v))), q),
      lt: (col: string, v: unknown) => ((rows = rows.filter((r) => String(r[col] ?? "") < String(v))), q),
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
    { tenant_id: "agency-a", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "ta1", talent_profiles: { id: "ta1", profile_code: "TAL-A1", display_name: "A One", workflow_status: "published" } },
    { tenant_id: "agency-a", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "ta2", talent_profiles: { id: "ta2", profile_code: "TAL-A2", display_name: "A Two", workflow_status: "approved" } },
    { tenant_id: "agency-b", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "tb1", talent_profiles: { id: "tb1", profile_code: "TAL-B1", display_name: "B One", workflow_status: "published" } },
  ],
  ...TABLES,
};

test("an agency page lists its own roster and zero talent from any other tenant", async () => {
  const rows = await loadTalentRows(fakeAdmin(ROSTER), "agency-a", null, new Date());
  assert.deepEqual(rows.map((r) => r.title).sort(), ["A One", "A Two"]);
  assert.ok(rows.every((r) => r.talentProfileId?.startsWith("ta")));
});

// TUL-1068 (QA: guest Concierge on /w/qa-paid-owner listed hub talent TAL-93940 "QA Fixture - Max Talent").
// A roster row of ANOTHER tenant never surfaces; and in the SAME tenant only ACTIVE + published people do.
test("TUL-1068: a hub talent with a roster row only in another tenant never shows on this agency", async () => {
  const tables = {
    agency_talent_roster: [
      { tenant_id: "agency-a", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "ta1", talent_profiles: { id: "ta1", profile_code: "TAL-A1", display_name: "A One", workflow_status: "published" } },
      { tenant_id: "hub", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "max", talent_profiles: { id: "max", profile_code: "TAL-93940", display_name: "QA Fixture - Max Talent", workflow_status: "published" } },
    ],
  };
  const rows = await loadTalentRows(fakeAdmin(tables), "agency-a", null, new Date());
  assert.deepEqual(rows.map((r) => r.title), ["A One"]);
});

test("TUL-1068: pending / inactive / archived roster members and unpublished profiles are not offered to a guest", async () => {
  const mk = (id: string, status: string, wf: string) => ({
    tenant_id: "agency-a", status, agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: id,
    talent_profiles: { id, profile_code: `TAL-${id}`, display_name: `P ${id}`, workflow_status: wf },
  });
  const tables = {
    agency_talent_roster: [
      mk("ok", "active", "published"),
      mk("pend", "pending", "published"),
      mk("inact", "inactive", "published"),
      mk("arch", "archived_for_downgrade", "published"),
      mk("draft", "active", "draft"),
    ],
  };
  const rows = await loadTalentRows(fakeAdmin(tables), "agency-a", null, new Date());
  assert.deepEqual(rows.map((r) => r.talentProfileId), ["ok"]);
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

import { loadCatalogRowsForScope } from "./items-catalog";

// TUL-1070 round 3: the dock must be scoped by the talent it BELONGS to, not by the URL. A talent
// site's path is "/", so the hub-wide catalog (other tenants' services + the global roster) leaked.
const THREE = {
  agency_talent_roster: [
    { tenant_id: "hub", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "t-andres", talent_profiles: { id: "t-andres", profile_code: "TAL-AND", display_name: "Andres", workflow_status: "published" } },
    { tenant_id: "hub", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "t-max", talent_profiles: { id: "t-max", profile_code: "TAL-MAX", display_name: "Max", workflow_status: "published" } },
    { tenant_id: "hub", status: "active", agency_visibility: "site_visible", talent_site_hidden: false, talent_profile_id: "t-qa", talent_profiles: { id: "t-qa", profile_code: "TAL-QA", display_name: "QA Fixture", workflow_status: "published" } },
  ],
  talent_offerings: [
    offering("o-and", "hub", "t-andres", "Menú Andrés"),
    offering("o-max", "tenant-max", "t-max", "QA Grok Manicure"),
    offering("o-qa1", "hub", "t-qa", "Sesión de retrato QA"),
    offering("o-qa2", "hub", "t-qa", "Limpieza profunda"),
  ],
  sessions: [{ id: "s1", tenant_id: "hub", offering_id: "o-qa1", status: "scheduled", title: "Someone else's event" }],
};

test("a dock bound to one talent lists only that talent: no foreign services, roster or sessions", async () => {
  const base = { tenantId: "hub", forcedTalent: true, window: null, now: new Date(), date: null, reservations: false };
  const andres = await loadCatalogRowsForScope(fakeAdmin(THREE), { ...base, talentProfileId: "t-andres" });
  assert.deepEqual(andres.map((r) => r.title), ["Menú Andrés"]);

  const max = await loadCatalogRowsForScope(fakeAdmin(THREE), { ...base, talentProfileId: "t-max" });
  assert.deepEqual(max.map((r) => r.title), ["QA Grok Manicure"], "its own service must be present even when its row sits on another tenant");

  const qa = await loadCatalogRowsForScope(fakeAdmin(THREE), { ...base, talentProfileId: "t-qa" });
  assert.deepEqual(qa.map((r) => r.title).sort(), ["Limpieza profunda", "Sesión de retrato QA"]);

  const foreign = new Set(["t-max", "t-qa"]);
  assert.ok(andres.every((r) => !r.talentProfileId || !foreign.has(r.talentProfileId)), "zero foreign talent ids");
  assert.ok(andres.every((r) => !r.title.includes("QA") && r.title !== "Limpieza profunda"), "zero foreign services");
});

test("without a bound talent the tenant keeps its own roster (agency pages unchanged)", async () => {
  const rows = await loadCatalogRowsForScope(fakeAdmin(THREE), { tenantId: "hub", talentProfileId: null, forcedTalent: false, window: null, now: new Date(), date: null, reservations: false });
  const people = rows.filter((r) => r.category === "talent").map((r) => r.title).sort();
  assert.deepEqual(people, ["Andres", "Max", "QA Fixture"]);
});

test("the dock receives its talent from the server, never only from the URL", () => {
  const model = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_chat/use-guest-dock-model.ts"), "utf8");
  const mount = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx"), "utf8");
  const dock = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_chat/GuestDockCatalog.tsx"), "utf8");
  assert.match(mount, /dockTalentProfileCode: talentProfileCode/);
  assert.match(model, /profileCode: input\.brand\.dockTalentProfileCode/);
  assert.match(dock, /p\.profileCode \?\? /);
});
