/**
 * Promos v1 money path through the ONE purchase pipeline.
 *
 * What is asserted is ORDER: the promo is priced before the order, held after
 * the order exists and BEFORE the payment row (so before any Stripe session the
 * action opens from it), and a hold that fails refuses the purchase with
 * nothing to pay. Driven through a typed fake client that records every call.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPurchase, type PurchaseInput } from "@/lib/orders/purchase";
import type { BookingPromoRequest } from "@/lib/orders/purchase-promo";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OFFERING = "22222222-2222-2222-2222-222222222222";
const POOL = "33333333-3333-3333-3333-333333333333";
const PROMO = "44444444-4444-4444-4444-444444444444";

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown };
type Result = { data: unknown; error: null };

function promoRow(over: Row = {}): Row {
  return {
    id: PROMO, tenant_id: TENANT, code: null, name: null, label: null, kind: "percent", offer_kind: "percent",
    value: 20, currency: "MXN", addon_id: null, scope_kind: "all", min_subtotal_cents: null, audience: "public",
    customer_id: null, is_single_use: false, unlock: "auto", link_slug: null, applies_on: "purchase",
    starts_at: null, ends_at: null, use_by_date: null, tz: "America/Mexico_City", weekdays: null,
    time_from: null, time_to: null, slot_id: null, max_redemptions: 10, per_customer_limit: 1,
    deposit_required: false, show_on_site: true, show_countdown: false, title_i18n: null, description_i18n: null,
    visual_style: null, template_key: null, is_active: true, is_draft: false, is_paused: false, archived_at: null,
    is_trial: false, parent_promo_id: null, created_at: new Date(Date.now() - 86_400_000).toISOString(), lapsed_days: null,
    ...over,
  };
}

function fake(opts: {
  promos?: Row[];
  hold?: { ok: boolean; reason?: string };
  capacityRefusal?: string;
  amountCents?: number;
  reserveMode?: string;
} = {}) {
  const calls: Call[] = [];
  const redemptions: Row[] = [];
  const offeringRow = {
    id: OFFERING, tenant_id: TENANT, title: "Uñas", status: "published", moderation_state: "approved", visibility: "public", price_type: "fixed",
    amount_cents: opts.amountCents ?? 50000, currency: "MXN", talent_profile_id: null,
    reserve_mode: opts.reserveMode ?? "full", deposit_pct: null, allow_pay_in_person: false,
    require_account_to_book: false, cancellation_hours: null,
  };

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let selecting = true;
    const rowsFor = (): Row[] => {
      if (table === "talent_offerings") return [offeringRow];
      if (table === "order_lines") return [{ id: "line_1", offering_id: OFFERING, sort_order: 0 }];
      if (table === "capacity_pools") return [{ id: POOL, tenant_id: TENANT }];
      if (table === "tenant_promo_codes") return opts.promos ?? [];
      if (table === "tenant_promo_redemptions") {
        return redemptions.filter((r) => filters.every(([k, v]) => r[k] === v));
      }
      return [];
    };
    const q = {
      select: () => q,
      insert: (payload: unknown) => {
        selecting = false;
        calls.push({ table, op: "insert", payload });
        return q;
      },
      update: (payload: unknown) => {
        selecting = false;
        calls.push({ table, op: "update", payload });
        return q;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      in: () => q,
      lte: () => q,
      is: () => q,
      gt: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async (): Promise<Result> => ({ data: null, error: null }),
      single: async (): Promise<Result> => {
        const ids: Record<string, string> = {
          orders: "order_1", customers: "cust_1", agency_bookings: "booking_1", booking_transactions: "txn_1",
        };
        return { data: ids[table] ? { id: ids[table] } : null, error: null };
      },
      then: (resolve: (v: Result) => unknown) => resolve({ data: selecting ? rowsFor() : [], error: null }),
    };
    return q;
  };

  const rpc = async (fn: string, args: Record<string, unknown> = {}): Promise<Result> => {
    calls.push({ table: `rpc:${fn}`, op: "rpc", payload: args });
    switch (fn) {
      case "ensure_customer_for_tenant":
        return { data: "cust_1", error: null };
      case "reserve_resource_set_v2":
        return opts.capacityRefusal
          ? { data: { ok: false, reason: opts.capacityRefusal, failed_pool_id: POOL, failed_talent_id: null }, error: null }
          : { data: { ok: true, already: false, hold_ids: [], allocation_ids: ["alloc_1"], expires_at: null }, error: null };
      case "commit_capacity":
        return { data: { ok: true, committed: 1 }, error: null };
      case "release_capacity":
        return { data: { released: 1, already_released: 0 }, error: null };
      case "promo_hold": {
        const verdict = opts.hold ?? { ok: true };
        if (!verdict.ok) return { data: verdict, error: null };
        const id = `red_${redemptions.length + 1}`;
        redemptions.push({ id, order_id: args.p_order_id, status: "held", promo_code_id: args.p_code_id, discount_cents: args.p_amount_cents });
        return { data: { ok: true, redemption_id: id, status: "held" }, error: null };
      }
      case "promo_confirm": {
        const row = redemptions.find((r) => r.id === args.p_redemption_id);
        if (row) row.status = "confirmed";
        return { data: { ok: true, already: false }, error: null };
      }
      case "promo_release": {
        const row = redemptions.find((r) => r.id === args.p_redemption_id);
        if (row) row.status = "released";
        return { data: { ok: true, already: false }, error: null };
      }
      default:
        return { data: null, error: null };
    }
  };

  return { calls, redemptions, admin: { from, rpc } as unknown as SupabaseClient };
}

const PROMO_REQ: BookingPromoRequest = { flow: "instant", linkPromoIds: [], code: null };

function input(over: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    tenantId: TENANT,
    clientOrderKey: "instant:1",
    actorUserId: null,
    contact: { email: "ana@example.com" },
    lines: [{ offeringId: OFFERING, units: 1 }],
    paymentChoice: "full",
    sourceChannel: "instant_book",
    capacity: [{ offeringId: OFFERING, poolId: POOL, units: 1 }],
    bookingPromo: PROMO_REQ,
    ...over,
  };
}

const idx = (calls: Call[], table: string, op: string) => calls.findIndex((c) => c.table === table && c.op === op);

test("a live promo is HELD after the order and BEFORE the payment row; the charge is discounted", async () => {
  const { calls, redemptions, admin } = fake({ promos: [promoRow()] });
  const r = await createPurchase(admin, input());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.ok && r.collectCents, 40000, "Stripe is asked for the promo price, 400 MXN, not 500");

  const order = calls.find((c) => c.table === "orders" && c.op === "insert")?.payload as Row;
  assert.equal(order.discount_cents, 10000);
  assert.equal(order.total_cents, 40000);
  const txn = calls.find((c) => c.table === "booking_transactions" && c.op === "insert")?.payload as Row;
  assert.equal(txn.gross_amount_cents, 40000);

  const hold = idx(calls, "rpc:promo_hold", "rpc");
  assert.ok(idx(calls, "orders", "insert") < hold, "the hold names the order, so the order exists first");
  assert.ok(hold < idx(calls, "booking_transactions", "insert"), "hold BEFORE the payment row");
  const held = calls[hold]?.payload as Row;
  assert.equal(held.p_order_id, "order_1");
  assert.equal(held.p_hold_minutes, 10, "instant checkout holds for 10 minutes");
  assert.equal(held.p_client_status, "new");

  // Snapshots written on the held row; a card checkout is confirmed by the webhook, not here.
  const snap = calls.find((c) => c.table === "tenant_promo_redemptions" && c.op === "update")?.payload as Row;
  assert.deepEqual(snap, { list_cents: 50000, discount_cents: 10000, currency: "MXN", source_channel: "site" });
  assert.equal(redemptions[0]?.status, "held");
  assert.equal(idx(calls, "rpc:promo_confirm", "rpc"), -1);
});

test("a hold that fails (sold out) refuses BEFORE any payment row, and cancels the order", async () => {
  const { calls, admin } = fake({ promos: [promoRow()], hold: { ok: false, reason: "exhausted" } });
  const r = await createPurchase(admin, input());
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "promo_exhausted");
  assert.equal(idx(calls, "booking_transactions", "insert"), -1, "nothing to pay: never silently full price");
  assert.equal(idx(calls, "rpc:reserve_resource_set_v2", "rpc"), -1, "no seat is held for a refused booking");
  const cancelled = calls.find((c) => c.table === "orders" && c.op === "update" && (c.payload as Row).status === "cancelled");
  assert.ok(cancelled);
});

test("client limit at the lock reads as promo_customer_limit", async () => {
  const { admin } = fake({ promos: [promoRow()], hold: { ok: false, reason: "customer_limit_reached" } });
  const r = await createPurchase(admin, input());
  assert.equal(!r.ok && r.reason, "promo_customer_limit");
});

test("a later failure (slot gone) releases the held promo through the unwind ledger", async () => {
  const { calls, redemptions, admin } = fake({ promos: [promoRow()], capacityRefusal: "sold_out" });
  const r = await createPurchase(admin, input());
  assert.equal(!r.ok && r.reason, "sold_out");
  assert.ok(idx(calls, "rpc:promo_release", "rpc") >= 0);
  assert.equal(redemptions[0]?.status, "released");
});

test("free booking: no payment row, the order settles, and the promo is confirmed now", async () => {
  // 80 MXN at fixed_price 5 -> 8 MXN after the 90% cap: under Stripe's 10 MXN floor.
  const { calls, redemptions, admin } = fake({
    amountCents: 8000,
    promos: [promoRow({ offer_kind: "fixed_price", kind: "fixed_price", value: 500 })],
  });
  const r = await createPurchase(admin, input());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.ok && r.collectCents, 0);
  assert.equal(r.ok && r.transactionId, null);
  assert.equal(idx(calls, "booking_transactions", "insert"), -1, "free booking skips Stripe");
  const order = calls.find((c) => c.table === "orders" && c.op === "insert")?.payload as Row;
  assert.equal(order.total_cents, 0);
  assert.equal(order.discount_cents, 8000);
  assert.equal(redemptions[0]?.status, "confirmed");
});

test("a typed code that does not apply refuses before an order exists", async () => {
  const { calls, admin } = fake({ promos: [promoRow({ unlock: "code", code: "LUZ10" })] });
  const r = await createPurchase(admin, input({ bookingPromo: { ...PROMO_REQ, code: "NOPE" } }));
  assert.equal(!r.ok && r.reason, "promo_unknown");
  assert.equal(idx(calls, "orders", "insert"), -1);
});

test("the sheet showed a bigger discount than is live now: refused as gone, nothing written", async () => {
  const { calls, admin } = fake({ promos: [promoRow()] });
  const r = await createPurchase(admin, input({ bookingPromo: { ...PROMO_REQ, shownDiscountCents: 15000 } }));
  assert.equal(!r.ok && r.reason, "promo_exhausted");
  assert.equal(idx(calls, "orders", "insert"), -1);
});

test("no promos live: the booking prices and charges exactly as before", async () => {
  const { calls, admin } = fake({ promos: [] });
  const r = await createPurchase(admin, input());
  assert.equal(r.ok && r.collectCents, 50000);
  assert.equal(idx(calls, "rpc:promo_hold", "rpc"), -1);
});
