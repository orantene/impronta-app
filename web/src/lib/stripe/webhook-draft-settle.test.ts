/**
 * TUL-1268 M1 (Wave E1): a booking paid through Stripe hosted Checkout must end
 * with its money row marked paid.
 *
 * `createPurchase` opens the order-backed `booking_transactions` row at `draft`
 * (orders/purchase.ts, "MUST be 'draft'"), and the guest card lanes that open a
 * hosted Checkout session for it (instant book, tickets, cart, class timetable,
 * package, appointment picker) never move it to `payment_requested`. `markPaid`
 * only leaves `payment_requested | pending | disputed`, and the database status
 * trigger refuses `draft -> paid`. So the webhook's settle was refused, the row
 * was not "already settled", and the delivery returned a retryable error that
 * Stripe replayed for three days against a row that could never be paid.
 *
 * These tests drive `settleCheckoutPayment` through `classifyStripeEvent` over a
 * stateful fake of the one money row. The fake `markPaid` applies the SAME
 * from-set as the real one; a static test below pins that set to the source, so
 * the model cannot drift from `transactions.ts`. Nothing here calls Stripe.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { settleCheckoutPayment, type SettleDeps } from "./webhook-card-settle";
import { classifyStripeEvent } from "./webhook-routing";
import type { StripeAccountKey } from "./client";

const TXN = "22222222-2222-4222-8222-222222222222";
const PI = "pi_test_e1";
const GROSS = 101500;

/** `markPaid`'s from-set in transactions.ts (pinned by the static test). */
const MARK_PAID_FROM = ["payment_requested", "pending", "disputed"];

type MoneyRow = {
  id: string;
  status: string;
  gross_amount_cents: number;
  currency: string;
  platform_fee_cents: number;
  net_amount_cents: number;
  checkout_type: string;
};

function draftRow(over: Partial<MoneyRow> = {}): MoneyRow {
  // Exactly what createPurchase inserts for a card checkout.
  return {
    id: TXN,
    status: "draft",
    gross_amount_cents: GROSS,
    currency: "MXN",
    platform_fee_cents: 1500,
    net_amount_cents: 100000,
    checkout_type: "full",
    ...over,
  };
}

type World = {
  row: MoneyRow | null;
  updates: Array<Record<string, unknown>>;
  markPaidCalls: number;
  paidTransitions: number;
  order: string[];
  updateError?: { message: string } | null;
  /** Simulate a concurrent writer moving the row between the guard read and the advance. */
  raceTo?: string;
};

/** Fake of the reads `settleCheckoutPayment` makes and the one conditional update the advance makes. */
function fakeAdmin(w: World): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "booking_transactions");
      return {
        select(_cols: string) {
          return {
            eq(col: string, value: string) {
              assert.equal(col, "id");
              return {
                maybeSingle: async () => ({
                  data: w.row && w.row.id === value ? { ...w.row } : null,
                  error: null,
                }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const filters: Array<[string, unknown]> = [];
          const chain = {
            eq(col: string, value: unknown) {
              filters.push([col, value]);
              return chain;
            },
            async select(_cols: string) {
              w.order.push("advance");
              w.updates.push(patch);
              if (w.updateError) return { data: null, error: w.updateError };
              if (w.raceTo && w.row) w.row.status = w.raceTo;
              const match =
                w.row !== null &&
                filters.every(([c, v]) => (w.row as Record<string, unknown>)[c] === v);
              if (!match || !w.row) return { data: [], error: null };
              // The database trigger: draft may only go to payment_requested / cancelled.
              if (w.row.status === "draft" && patch.status !== "payment_requested" && patch.status !== "cancelled") {
                return { data: null, error: { message: "invalid status transition" } };
              }
              w.row = { ...w.row, ...(patch as Partial<MoneyRow>) };
              return { data: [{ id: w.row.id }], error: null };
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

function deps(w: World, account: StripeAccountKey = "us"): Partial<SettleDeps> {
  return {
    getAdmin: () => fakeAdmin(w),
    recordChargePlatform: async () => {
      w.order.push(`record:${account}`);
      return true;
    },
    loadChargePlatformForTransaction: async () => account,
    markPaid: async (id) => {
      w.order.push("markPaid");
      w.markPaidCalls += 1;
      if (!w.row || w.row.id !== id) return { ok: false, error: "Transaction not found." };
      if (!MARK_PAID_FROM.includes(w.row.status)) {
        return { ok: false, error: `Cannot transition from '${w.row.status}' to 'paid'.` };
      }
      w.row = { ...w.row, status: "paid" };
      w.paidTransitions += 1;
      return { ok: true };
    },
  };
}

function world(row: MoneyRow | null = draftRow()): World {
  return { row, updates: [], markPaidCalls: 0, paidTransitions: 0, order: [] };
}

function sessionEvent(
  type: "checkout.session.completed" | "checkout.session.async_payment_succeeded",
  over: { payment_status?: string; amount_total?: number; id?: string } = {},
): Stripe.Event {
  return {
    id: over.id ?? `evt_${type}`,
    object: "event",
    type,
    livemode: false,
    data: {
      object: {
        id: "cs_test_e1",
        object: "checkout.session",
        mode: "payment",
        payment_status: over.payment_status ?? "paid",
        client_reference_id: TXN,
        metadata: { transaction_id: TXN },
        payment_intent: PI,
        amount_total: over.amount_total ?? GROSS,
        currency: "mxn",
      },
    },
  } as unknown as Stripe.Event;
}

function intentEvent(): Stripe.Event {
  return {
    id: "evt_pi_succeeded",
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    data: {
      object: { id: PI, object: "payment_intent", amount: GROSS, currency: "mxn", metadata: { transaction_id: TXN } },
    },
  } as unknown as Stripe.Event;
}

/** What the webhook handler does: classify, then settle a booking_payment. */
async function deliver(event: Stripe.Event, w: World, account: StripeAccountKey = "us") {
  const action = classifyStripeEvent(event);
  if (action.kind !== "booking_payment") return { routed: action.kind } as const;
  return settleCheckoutPayment(event, action, account, deps(w, account));
}

describe("E1: hosted Checkout bookings end paid", () => {
  test("instant book: checkout.session.completed (paid) on a draft row marks it paid", async () => {
    const w = world();
    const r = await deliver(sessionEvent("checkout.session.completed"), w);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.equal(w.row?.status, "paid");
    assert.equal(w.paidTransitions, 1);
  });

  test("async method: completed with payment_status unpaid waits, async_payment_succeeded marks it paid", async () => {
    const w = world();
    const first = await deliver(sessionEvent("checkout.session.completed", { payment_status: "unpaid" }), w);
    assert.deepEqual(first, { routed: "ignore" });
    assert.equal(w.row?.status, "draft");
    assert.equal(w.markPaidCalls, 0);
    const second = await deliver(sessionEvent("checkout.session.async_payment_succeeded"), w);
    assert.deepEqual(second, { ok: true, outcome: "paid" });
    assert.equal(w.row?.status, "paid");
  });

  test("MX lane: the charge platform is recorded before the advance, then the row is paid", async () => {
    const w = world();
    const r = await deliver(sessionEvent("checkout.session.completed"), w, "mx");
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.deepEqual(w.order, ["record:mx", "advance", "markPaid"]);
    assert.equal(w.row?.status, "paid");
  });

  test("replays and the companion payment_intent.succeeded never double-mark", async () => {
    const w = world();
    const evt = sessionEvent("checkout.session.completed");
    assert.deepEqual(await deliver(evt, w), { ok: true, outcome: "paid" });
    assert.deepEqual(await deliver(evt, w), { ok: true, outcome: "already_settled" });
    assert.deepEqual(await deliver(intentEvent(), w), { ok: true, outcome: "already_settled" });
    assert.deepEqual(await deliver(sessionEvent("checkout.session.async_payment_succeeded"), w), {
      ok: true,
      outcome: "already_settled",
    });
    assert.equal(w.paidTransitions, 1);
    assert.equal(w.row?.status, "paid");
  });

  test("a row already at payment_requested (payment link, POS) is untouched by the advance and paid", async () => {
    const w = world(draftRow({ status: "payment_requested" }));
    const r = await deliver(sessionEvent("checkout.session.completed"), w);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.equal(w.row?.status, "paid");
    assert.equal(w.paidTransitions, 1);
  });

  test("amount mismatch on a draft row: no advance, no mark, row stays draft", async () => {
    const w = world();
    const r = await deliver(sessionEvent("checkout.session.completed", { amount_total: GROSS - 1 }), w);
    assert.deepEqual(r, { ok: true, outcome: "amount_mismatch" });
    assert.equal(w.updates.length, 0);
    assert.equal(w.markPaidCalls, 0);
    assert.equal(w.row?.status, "draft");
  });

  test("advance write error: the delivery is retried and markPaid never runs", async () => {
    const w = world();
    w.updateError = { message: "connection reset" };
    const r = await deliver(sessionEvent("checkout.session.completed"), w);
    assert.ok("ok" in r && r.ok === false, "retryable settle error");
    assert.equal(w.markPaidCalls, 0);
    assert.equal(w.row?.status, "draft");
  });

  test("advance raced by a concurrent settle: no error, the row ends paid exactly once", async () => {
    const w = world();
    w.raceTo = "paid";
    const r = await deliver(sessionEvent("checkout.session.completed"), w);
    assert.deepEqual(r, { ok: true, outcome: "already_settled" });
    assert.equal(w.row?.status, "paid");
    assert.equal(w.paidTransitions, 0);
  });

  test("a cancelled row is never advanced or paid by a late settlement", async () => {
    const w = world(draftRow({ status: "cancelled" }));
    const r = await deliver(sessionEvent("checkout.session.completed"), w);
    assert.ok("ok" in r && r.ok === false, "retryable settle error");
    assert.equal(w.row?.status, "cancelled");
    assert.equal(w.paidTransitions, 0);
  });

  test("webhook before the row exists: retryable, nothing written", async () => {
    const w = world(null);
    const r = await deliver(sessionEvent("checkout.session.completed"), w);
    assert.ok("ok" in r && r.ok === false, "retryable settle error");
    assert.equal(w.paidTransitions, 0);
  });
});

describe("E1 invariance: amounts, fees and Stripe untouched", () => {
  test("the advance writes only status and updated_at, guarded on status draft", async () => {
    const w = world();
    const before = { ...(w.row as MoneyRow) };
    await deliver(sessionEvent("checkout.session.completed"), w);
    assert.equal(w.updates.length, 1);
    assert.deepEqual(Object.keys(w.updates[0]).sort(), ["status", "updated_at"]);
    assert.equal(w.updates[0].status, "payment_requested");
    const after = w.row as MoneyRow;
    for (const k of ["gross_amount_cents", "currency", "platform_fee_cents", "net_amount_cents", "checkout_type"] as const) {
      assert.equal(after[k], before[k], `${k} unchanged`);
    }
  });

  test("the advance module makes no Stripe call and touches no amount column", () => {
    const src = readFileSync(join(__dirname, "webhook-draft-advance.ts"), "utf8");
    assert.doesNotMatch(src, /from ["']stripe["']|getStripe|stripe\./);
    assert.doesNotMatch(src, /amount|fee_cents|refund|commission/i);
  });
});

describe("E1 model pins (static)", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

  test("markPaid still leaves only payment_requested | pending | disputed (the fake mirrors this)", () => {
    const src = read("bookings/transactions.ts");
    const body = src.slice(src.indexOf("export async function markPaid("));
    assert.match(body.slice(0, 4000), /\["payment_requested", "pending", "disputed"\],\s*"paid"/);
  });

  test("createPurchase still opens the card transaction at draft", () => {
    const src = read("orders/purchase.ts");
    assert.match(src, /status: "draft",\s*\n\s*\/\/ A deposit is a PART payment/);
  });
});
