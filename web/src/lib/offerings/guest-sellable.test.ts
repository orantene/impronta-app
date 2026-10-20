/**
 * D-10: guests see only services that are published AND approved AND public.
 * Behaviour for the shared predicate and the Concierge dock lists (with a
 * two-tenant fake), and wiring checks for every other guest-facing surface.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isGuestSellableOffering, scopeToGuestSellableOfferings } from "./guest-sellable";
import { loadOfferingRows, loadTalentProfileOfferingRows } from "@/lib/messages-v5/items-catalog";

type Row = Record<string, unknown>;
function fake(tables: Record<string, Row[]>): SupabaseClient {
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
      in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
      neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q),
      order: () => q,
      limit: () => q,
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { from: (t: string) => query(t) } as unknown as SupabaseClient;
}

const base = { status: "published", moderation_state: "approved", visibility: "public" };

test("predicate: only published + approved + public passes", () => {
  assert.equal(isGuestSellableOffering(base), true);
  assert.equal(isGuestSellableOffering({ ...base, status: "draft" }), false, "unpublished");
  assert.equal(isGuestSellableOffering({ ...base, status: "archived" }), false);
  assert.equal(isGuestSellableOffering({ ...base, moderation_state: "pending" }), false, "unapproved");
  assert.equal(isGuestSellableOffering({ ...base, moderation_state: "rejected" }), false);
  assert.equal(isGuestSellableOffering({ ...base, visibility: "agency_only" }), false, "non-public");
  assert.equal(isGuestSellableOffering({ ...base, visibility: "on_request" }), false);
  assert.equal(isGuestSellableOffering({}), false);
  assert.equal(isGuestSellableOffering(null), false);
});

const row = (id: string, tenant: string, extra: Row = {}): Row => ({
  id, tenant_id: tenant, talent_profile_id: "t1", title: id, kind: "service", amount_cents: 100, currency: "USD",
  inventory_qty: null, capacity_pool_id: null, duration_minutes: 30, sort_order: 1, ...base, ...extra,
});
const TABLES = {
  talent_offerings: [
    row("ok-a", "A"),
    row("draft-a", "A", { status: "draft" }),
    row("pending-a", "A", { moderation_state: "pending" }),
    row("rejected-a", "A", { moderation_state: "rejected" }),
    row("agency-a", "A", { visibility: "agency_only" }),
    row("request-a", "A", { visibility: "on_request" }),
    row("ok-b", "B"),
  ],
};

test("query helper: list keeps only the sellable rows and tenant scoping stays the caller's", async () => {
  const admin = fake(TABLES);
  const { data } = await (scopeToGuestSellableOfferings(admin.from("talent_offerings").select("*").eq("tenant_id", "A")) as unknown as PromiseLike<{ data: Row[] }>);
  assert.deepEqual(data.map((r) => r.id), ["ok-a"]);
});

test("dock service list (loadOfferingRows): unpublished, unapproved, non-public are excluded; sellable included; tenant A never sees B", async () => {
  const a = await loadOfferingRows(fake(TABLES), "A");
  assert.deepEqual(a.map((r) => r.title), ["ok-a"]);
  const b = await loadOfferingRows(fake(TABLES), "B");
  assert.deepEqual(b.map((r) => r.title), ["ok-b"]);
});

test("dock per-talent list: same rule (on_request no longer listed), tenant scoping preserved", async () => {
  const a = await loadTalentProfileOfferingRows(fake(TABLES), "A", "t1");
  assert.deepEqual(a.map((r) => r.title), ["ok-a"]);
  assert.deepEqual(await loadTalentProfileOfferingRows(fake(TABLES), "C", "t1"), []);
});

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

test("visit menu (guest-order.ts): the list uses the shared filter and the add path checks the predicate", () => {
  const src = read("src/lib/visits/guest-order.ts");
  assert.match(src, /scopeToGuestSellableOfferings\(/);
  assert.match(src, /\.eq\("tenant_id", input\.tenantId\)/);
  assert.match(src, /!isGuestSellableOffering\(off\)/);
  assert.match(src, /select\("id, status, moderation_state, visibility, title, amount_cents, currency"\)/);
});

test("class timetable, session picker, event tickets: published also means approved and public", () => {
  assert.match(read("src/lib/storefront/class-timetable.core.ts"), /published: isGuestSellableOffering\(o\)/);
  const sessions = read("src/app/(public)/_sessions/session-picker-actions.ts");
  assert.match(sessions, /scopeToSellableOfferings\([\s\S]{0,160}"guest"/);
  assert.match(sessions, /!isGuestSellableOffering\(offering\)/);
  const events = read("src/app/(public)/_events/ticket-picker-actions.ts");
  assert.equal((events.match(/!isGuestSellableOffering\(offering\)/g) ?? []).length, 2, "picker and buy both gate");
});

test("open times, live availability and booking surface also require approval", () => {
  assert.match(read("src/lib/scheduling/public-open-times.ts"), /sellability\(offering, "guest"\)/);
  assert.match(read("src/lib/scheduling/profile-live-availability.ts"), /scopeToSellableOfferings\([\s\S]{0,200}"guest"/);
  assert.match(read("src/lib/scheduling/booking-surface.ts"), /sellability\(offering, "guest_request"\)/);
});
