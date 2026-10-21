/**
 * TUL-1472 fixes [MONEY]: a dated purchase made from a TALENT-SITE page.
 *
 *   P1-1  the talent's accepting switch + booking posture gate the sale (fail closed)
 *   P1-2  the card is charged the price the page shows (the live promo is priced, not list)
 *   P2    talent-site attribution on the order
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPurchase } from "@/lib/orders/purchase";
import { displayPrice } from "@/lib/promos/display-price";
import type { Promo } from "@/lib/promos/types";
import { buildDatedPurchase, talentSiteDatedExtras } from "./dated-purchase";
import { datedTalentGate } from "./dated-talent-gate";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OFFERING = "22222222-2222-2222-2222-222222222222";
const POOL = "33333333-3333-3333-3333-333333333333";
const PROMO = "44444444-4444-4444-4444-444444444444";
const TALENT = "55555555-5555-5555-5555-555555555555";
const SESSION = { id: "66666666-6666-6666-6666-666666666666", startsAt: "2099-11-10T15:00:00Z", endsAt: "2099-11-10T17:00:00Z" };

type Row = Record<string, unknown>;

/* ─── P1-1: the gate ──────────────────────────────────────────────────── */

type Res = { data: Row | null; error: { code: string } | null };
type Tables = Partial<Record<"talent_offerings" | "talent_sites" | "talent_profiles", Res>>;

/** A reader that answers each table with one canned result (FakeQuery shape, no any). */
function reader(tables: Tables) {
  return {
    from: (table: string) => {
      const res = tables[table as keyof Tables] ?? { data: null, error: null };
      const q = { select: () => q, eq: () => q, maybeSingle: async () => res };
      return q;
    },
  };
}
const OK_OFFERING: Res = { data: { talent_profile_id: TALENT, booking_mode: null }, error: null };
const PROFILE_INSTANT: Res = { data: { selling_defaults: { bookingPosture: "instant" } }, error: null };
const gate = (t: Tables, expected: string | null = TALENT) =>
  datedTalentGate(reader(t), { tenantId: TENANT, offeringId: OFFERING, expectedTalentProfileId: expected });

test("accepting talent with an instant posture sells", async () => {
  const r = await gate({ talent_offerings: OK_OFFERING, talent_sites: { data: { accepting_bookings: true }, error: null }, talent_profiles: PROFILE_INSTANT });
  assert.deepEqual(r, { ok: true, talentProfileId: TALENT });
  // No talent_sites row = accepting, exactly as on the instant-book path.
  const noSite = await gate({ talent_offerings: OK_OFFERING, talent_profiles: PROFILE_INSTANT });
  assert.equal(noSite.ok, true);
});

test("a talent who paused bookings sells nothing", async () => {
  const r = await gate({ talent_offerings: OK_OFFERING, talent_sites: { data: { accepting_bookings: false }, error: null }, talent_profiles: PROFILE_INSTANT });
  assert.deepEqual(r, { ok: false, reason: "not_accepting_bookings" });
});

test("a request or message-only posture sells nothing, from the talent default or the item's own mode", async () => {
  const site: Res = { data: { accepting_bookings: true }, error: null };
  const req = await gate({ talent_offerings: OK_OFFERING, talent_sites: site, talent_profiles: { data: { selling_defaults: { bookingPosture: "request" } }, error: null } });
  assert.deepEqual(req, { ok: false, reason: "request_only" });
  const inq = await gate({ talent_offerings: { data: { talent_profile_id: TALENT, booking_mode: "inquiry" }, error: null }, talent_sites: site, talent_profiles: PROFILE_INSTANT });
  assert.deepEqual(inq, { ok: false, reason: "inquiry_only" });
});

test("fails closed: any unreadable setting, no talent, or another site's talent refuses", async () => {
  const site: Res = { data: { accepting_bookings: true }, error: null };
  const boom: Res = { data: null, error: { code: "XX000" } };
  assert.equal((await gate({ talent_offerings: boom, talent_sites: site, talent_profiles: PROFILE_INSTANT })).ok, false);
  assert.equal((await gate({ talent_offerings: OK_OFFERING, talent_sites: boom, talent_profiles: PROFILE_INSTANT })).ok, false);
  assert.equal((await gate({ talent_offerings: OK_OFFERING, talent_sites: site, talent_profiles: boom })).ok, false);
  assert.equal((await gate({ talent_offerings: OK_OFFERING, talent_sites: site })).ok, false, "profile row missing");
  assert.equal((await gate({ talent_offerings: { data: null, error: null }, talent_sites: site, talent_profiles: PROFILE_INSTANT })).ok, false, "offering missing");
  assert.equal((await gate({ talent_offerings: { data: { talent_profile_id: null }, error: null }, talent_sites: site, talent_profiles: PROFILE_INSTANT })).ok, false, "no talent on the item");
  assert.equal((await gate({ talent_offerings: OK_OFFERING, talent_sites: site, talent_profiles: PROFILE_INSTANT }, "someone-else")).ok, false, "item belongs to another talent");
});

/* ─── P1-2 / P2: price shown = amount charged, attribution ─────────────── */

const LIST = 50000;
const PROMO_PAGE: Promo = { id: PROMO, offer_kind: "percent", value: 20, currency: "MXN", scope: "all", audience: "public", unlock: "auto", applies_on: "purchase", tz: "America/Mexico_City" };

function promoRow(): Row {
  return {
    id: PROMO, tenant_id: TENANT, code: null, name: null, label: null, kind: "percent", offer_kind: "percent",
    value: 20, currency: "MXN", addon_id: null, scope_kind: "all", min_subtotal_cents: null, audience: "public",
    customer_id: null, is_single_use: false, unlock: "auto", link_slug: null, applies_on: "purchase",
    starts_at: null, ends_at: null, use_by_date: null, tz: "America/Mexico_City", weekdays: null,
    time_from: null, time_to: null, slot_id: null, max_redemptions: 10, per_customer_limit: 1,
    deposit_required: false, show_on_site: true, show_countdown: false, title_i18n: null, description_i18n: null,
    visual_style: null, template_key: null, is_active: true, is_draft: false, is_paused: false, archived_at: null,
    is_trial: false, parent_promo_id: null, created_at: new Date(Date.now() - 86_400_000).toISOString(), lapsed_days: null,
  };
}

type Result = { data: unknown; error: null };

function fakeAdmin(promos: Row[]) {
  const inserts: Array<{ table: string; payload: Row }> = [];
  const offeringRow = {
    id: OFFERING, tenant_id: TENANT, title: "Clase", status: "published", moderation_state: "approved", visibility: "public",
    price_type: "fixed", amount_cents: LIST, currency: "MXN", talent_profile_id: null, reserve_mode: "full", deposit_pct: null,
    allow_pay_in_person: false, require_account_to_book: false, cancellation_hours: null,
  };
  const from = (table: string) => {
    let selecting = true;
    const rowsFor = (): Row[] => {
      if (table === "talent_offerings") return [offeringRow];
      if (table === "order_lines") return [{ id: "line_1", offering_id: OFFERING, sort_order: 0 }];
      if (table === "capacity_pools") return [{ id: POOL, tenant_id: TENANT }];
      if (table === "tenant_promo_codes") return promos;
      return [];
    };
    const q = {
      select: () => q,
      insert: (payload: Row) => { selecting = false; inserts.push({ table, payload }); return q; },
      update: () => { selecting = false; return q; },
      eq: () => q, in: () => q, is: () => q, gt: () => q, order: () => q, limit: () => q,
      maybeSingle: async (): Promise<Result> => ({ data: null, error: null }),
      single: async (): Promise<Result> => {
        const ids: Record<string, string> = { orders: "order_1", customers: "cust_1", agency_bookings: "booking_1", booking_transactions: "txn_1" };
        return { data: ids[table] ? { id: ids[table] } : null, error: null };
      },
      then: (resolve: (v: Result) => unknown) => resolve({ data: selecting ? rowsFor() : [], error: null }),
    };
    return q;
  };
  const rpc = async (fn: string, args: Row = {}): Promise<Result> => {
    switch (fn) {
      case "ensure_customer_for_tenant": return { data: "cust_1", error: null };
      case "reserve_resource_set_v2": return { data: { ok: true, already: false, hold_ids: [], allocation_ids: ["alloc_1"], expires_at: null }, error: null };
      case "promo_hold": return { data: { ok: true, redemption_id: "red_1", status: "held", p: args.p_order_id }, error: null };
      default: return { data: { ok: true }, error: null };
    }
  };
  return { inserts, admin: { from, rpc } as unknown as SupabaseClient };
}

const purchaseArgs = (extras: Partial<Parameters<typeof buildDatedPurchase>[0]>) => ({
  tenantId: TENANT,
  clientOrderKey: "dated:talent-site:1",
  offeringId: OFFERING,
  session: SESSION,
  legs: [{ tier: null, units: 1 }],
  poolIdForKey: new Map([["default", POOL]]),
  email: "ana@example.com",
  ...extras,
});

async function charged(extras: Partial<Parameters<typeof buildDatedPurchase>[0]>, promos: Row[]) {
  const purchase = buildDatedPurchase(purchaseArgs(extras));
  assert.ok(purchase, "purchase is built");
  const { inserts, admin } = fakeAdmin(promos);
  const r = await createPurchase(admin, purchase);
  assert.equal(r.ok, true, JSON.stringify(r));
  const order = inserts.find((i) => i.table === "orders")?.payload;
  return { collect: r.ok ? r.collectCents : -1, order, channel: order?.source_channel };
}

test("P1-2: with a live promo the card is charged the price the page shows", async () => {
  const shown = displayPrice({ id: OFFERING, list_cents: LIST, currency: "MXN" }, { promos: [PROMO_PAGE], now: "2099-01-01T00:00:00Z" });
  assert.equal(shown.hasPromo, true);
  assert.equal(shown.final_cents, 40000);
  const c = await charged(talentSiteDatedExtras({}), [promoRow()]);
  assert.equal(c.collect, shown.final_cents, "charged amount equals the displayed promo price");
  assert.equal(c.order?.discount_cents, LIST - shown.final_cents);
});

test("P1-2: with no promo the charge is the list price, same as the page", async () => {
  const shown = displayPrice({ id: OFFERING, list_cents: LIST, currency: "MXN" }, { promos: [], now: "2099-01-01T00:00:00Z" });
  assert.equal(shown.hasPromo, false);
  const c = await charged(talentSiteDatedExtras({}), []);
  assert.equal(c.collect, shown.final_cents);
  assert.equal(c.collect, LIST);
});

test("without the talent-site extras (the business page) nothing changes: no promo priced, session_picker", async () => {
  const purchase = buildDatedPurchase(purchaseArgs({}));
  assert.equal(purchase?.bookingPromo, undefined);
  assert.equal(purchase?.sourceChannel, "session_picker");
});

test("P2: the talent-site channel keeps its attribution and an instant hold", () => {
  const extras = talentSiteDatedExtras({ linkCookie: "77777777-7777-4777-8777-777777777777", viaCookie: "ig_story" });
  assert.equal(extras.sourceChannel, "talent_site");
  assert.equal(extras.bookingPromo.flow, "instant");
  assert.deepEqual(extras.bookingPromo.linkPromoIds, ["77777777-7777-4777-8777-777777777777"]);
  assert.equal(extras.bookingPromo.via, "ig_story");
  const purchase = buildDatedPurchase(purchaseArgs(extras));
  assert.equal(purchase?.sourceChannel, "talent_site");
});
