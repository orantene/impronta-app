/**
 * A3 negative suite (TUL-1068 / 1070 / 1246): two synthetic tenants, A and B, in an
 * in-memory fake. Tenant A must get NOTHING of tenant B's from every guest-facing
 * roster / catalog read that was audited: the shared roster scope, the directory id
 * list, the chip roster check, the Concierge dock rows and the dock offerings.
 * Synthetic ids only; no real tenant data and no database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  filterTalentIdsOnTenantRoster,
  isTalentOnTenantRoster,
  listTalentIdsOnTenantRoster,
  scopeToGuestVisibleRoster,
} from "./talent-roster";
import { loadOfferingRows, loadTalentProfileOfferingRows, loadTalentRows } from "@/lib/messages-v5/items-catalog";
import { scopeChipTalentToRoster } from "@/lib/inquiry/guest-chip-talent-scope";

type Row = Record<string, unknown>;

function pick(row: Row, col: string): unknown {
  return col.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Row)[k] : undefined), row);
}

/** Minimal chainable fake: eq / neq / in / order / limit / maybeSingle / thenable. */
function fake(tables: Record<string, Row[]>): SupabaseClient {
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => pick(r, c) === v)), q),
      neq: (c: string, v: unknown) => ((rows = rows.filter((r) => pick(r, c) !== v)), q),
      in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(pick(r, c)))), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { from: (t: string) => query(t) } as unknown as SupabaseClient;
}

const person = (id: string, name: string) => ({ id, profile_kind: "person", profile_code: `TAL-${id}`, display_name: name, workflow_status: "published" });
const rosterRow = (tenant: string, id: string, name: string, extra: Row = {}): Row => ({
  tenant_id: tenant, status: "active", agency_visibility: "site_visible", talent_site_hidden: false,
  talent_profile_id: id, talent_profiles: person(id, name), ...extra,
});
const offering = (id: string, tenant: string, talent: string, title: string): Row => ({
  id, tenant_id: tenant, talent_profile_id: talent, title, kind: "service", amount_cents: 1000, currency: "USD",
  status: "published", moderation_state: "approved", visibility: "public", inventory_qty: null, capacity_pool_id: null,
  duration_minutes: 30, sort_order: 1,
});

const TABLES = {
  agency_talent_roster: [
    rosterRow("A", "a1", "Alice A"),
    rosterRow("A", "a2", "Hidden A", { talent_site_hidden: true }),
    rosterRow("A", "a3", "Roster-only A", { agency_visibility: "roster_only" }),
    rosterRow("A", "a4", "Pending A", { status: "pending" }),
    rosterRow("B", "b1", "Bob B"),
    rosterRow("B", "shared", "Shared Talent"),
    rosterRow("A", "shared", "Shared Talent"),
  ],
  talent_offerings: [offering("oa", "A", "a1", "A service"), offering("ob", "B", "b1", "B service"), offering("os", "B", "shared", "B only for shared")],
};

const admin = fake(TABLES);

test("the shared roster scope returns only the asked tenant's visible, active, non-hidden rows", async () => {
  const q = scopeToGuestVisibleRoster(admin.from("agency_talent_roster").select("*"), "A") as unknown as PromiseLike<{ data: Row[] }>;
  const { data } = await q;
  assert.deepEqual(data.map((r) => r.talent_profile_id).sort(), ["a1", "shared"]);
  const b = (await (scopeToGuestVisibleRoster(admin.from("agency_talent_roster").select("*"), "B") as unknown as PromiseLike<{ data: Row[] }>)).data;
  assert.deepEqual(b.map((r) => r.talent_profile_id).sort(), ["b1", "shared"]);
});

test("directory id list: tenant A never lists B's talent", async () => {
  const ids = await listTalentIdsOnTenantRoster(admin, "A");
  assert.deepEqual(ids.sort(), ["a1", "shared"]);
  assert.ok(!ids.includes("b1"));
});

test("chip roster check: B's talent, a hidden, a roster-only and a pending member are all dropped for A", async () => {
  const kept = await filterTalentIdsOnTenantRoster(admin, "A", ["a1", "b1", "a2", "a3", "a4", "shared", "nobody"]);
  assert.deepEqual(kept.sort(), ["a1", "shared"]);
  assert.equal(await isTalentOnTenantRoster(admin, "A", "b1"), false);
  assert.equal(await isTalentOnTenantRoster(admin, "B", "b1"), true);
});

test("chip scope end to end: a cart holding B's talent writes only A's into A's inquiry", async () => {
  const out = (await scopeChipTalentToRoster({ selectedIds: ["a1", "b1", "shared"] } as never, (ids) => filterTalentIdsOnTenantRoster(admin, "A", ids))) as { selectedIds: string[] };
  assert.deepEqual(out.selectedIds, ["a1", "shared"]);
});

test("Concierge dock talent rows: A sees only A's visible members", async () => {
  const rows = await loadTalentRows(admin, "A", null, new Date());
  assert.deepEqual(rows.map((r) => r.talentProfileId).sort(), ["a1", "shared"]);
});

test("Concierge dock offerings: A never sees B's services, even for a talent on both rosters", async () => {
  const a = await loadOfferingRows(admin, "A");
  assert.deepEqual(a.map((r) => r.title), ["A service"]);
  const shared = await loadTalentProfileOfferingRows(admin, "A", "shared");
  assert.deepEqual(shared, [], "B's offering of the shared talent must not appear under A");
  assert.deepEqual((await loadTalentProfileOfferingRows(admin, "B", "shared")).map((r) => r.title), ["B only for shared"]);
});
