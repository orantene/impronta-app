/**
 * Replay tests for the card-settle path. The database and `markPaid` are
 * injected, so every branch (amount guard, already-settled, MX ordering) runs
 * without a network or a Supabase project.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { extractChargedAmount, settleCheckoutPayment, type SettleDeps } from "./webhook-card-settle";

const TXN = "11111111-1111-4111-8111-111111111111";
const PI = "pi_test_123";
const ACTION = { transactionId: TXN, paymentIntentId: PI };

function sessionEvent(
  type: "checkout.session.completed" | "checkout.session.async_payment_succeeded",
  amount: number | null = 101500,
  currency: string | null = "mxn",
): Stripe.Event {
  return {
    id: "evt_test_session",
    object: "event",
    type,
    livemode: false,
    data: { object: { id: "cs_test_1", object: "checkout.session", amount_total: amount, currency } },
  } as unknown as Stripe.Event;
}

function intentEvent(amount: number | null = 101500, currency: string | null = "mxn"): Stripe.Event {
  return {
    id: "evt_test_pi",
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    data: { object: { id: PI, object: "payment_intent", amount, currency } },
  } as unknown as Stripe.Event;
}

type Row = { data: Record<string, unknown> | null; error: { message: string } | null };

/** Fake of exactly `.from(t).select(cols).eq("id", x).maybeSingle()`. */
function fakeAdmin(opts: { guard?: Row; status?: Row }): SupabaseClient {
  const guard = opts.guard ?? { data: { gross_amount_cents: 101500, currency: "MXN" }, error: null };
  const status = opts.status ?? { data: null, error: null };
  return {
    from(table: string) {
      assert.equal(table, "booking_transactions");
      return {
        select(cols: string) {
          return {
            eq(col: string, value: string) {
              assert.equal(col, "id");
              assert.equal(value, TXN);
              return { maybeSingle: async () => (cols === "status" ? status : guard) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

type MarkPaidResult = { ok: true } | { ok: false; error: string };

type HarnessOptions = {
  admin?: SupabaseClient | null;
  markPaidResult?: MarkPaidResult;
  recordChargePlatform?: SettleDeps["recordChargePlatform"];
  loadChargePlatformForTransaction?: SettleDeps["loadChargePlatformForTransaction"];
  order?: string[];
};

function harness(over: HarnessOptions = {}) {
  const paidWith: Array<{ id: string; opts: { paymentIntentId?: string | null } | undefined }> = [];
  const deps: Partial<SettleDeps> = {
    markPaid: async (id, opts) => {
      over.order?.push("markPaid");
      paidWith.push({ id, opts });
      return over.markPaidResult ?? { ok: true };
    },
    recordChargePlatform: over.recordChargePlatform ?? (async () => true),
    loadChargePlatformForTransaction: over.loadChargePlatformForTransaction ?? (async () => "us"),
    getAdmin: () => (over.admin === undefined ? fakeAdmin({}) : over.admin),
  };
  return { deps, paidWith };
}

describe("settleCheckoutPayment amount guard", () => {
  test("matching amount and currency pays once with the PaymentIntent id", async () => {
    const h = harness();
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.equal(h.paidWith.length, 1);
    assert.deepEqual(h.paidWith[0], { id: TXN, opts: { paymentIntentId: PI } });
  });

  test("payment_intent.succeeded with matching amount pays", async () => {
    const h = harness();
    const r = await settleCheckoutPayment(intentEvent(), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.equal(h.paidWith.length, 1);
  });

  test("currency compare is case-insensitive", async () => {
    const h = harness({ admin: fakeAdmin({ guard: { data: { gross_amount_cents: 101500, currency: "mxn" }, error: null } }) });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed", 101500, "MXN"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
  });

  test("a different amount is an amount_mismatch and never pays", async () => {
    const h = harness();
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed", 90000), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "amount_mismatch" });
    assert.equal(h.paidWith.length, 0);
  });

  test("a different currency is an amount_mismatch and never pays", async () => {
    const h = harness();
    const r = await settleCheckoutPayment(intentEvent(101500, "usd"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "amount_mismatch" });
    assert.equal(h.paidWith.length, 0);
  });

  test("a guard read error fails the delivery (retry) and never pays", async () => {
    const h = harness({ admin: fakeAdmin({ guard: { data: null, error: { message: "boom" } } }) });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.equal(r.ok, false);
    assert.equal(h.paidWith.length, 0);
  });

  test("admin unavailable skips the guard and still pays (current behaviour)", async () => {
    const h = harness({ admin: null });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed", 1, "eur"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.equal(h.paidWith.length, 1);
  });
});

describe("settleCheckoutPayment already settled", () => {
  for (const status of ["paid", "payout_pending", "payout_sent"]) {
    test(`markPaid refuses and the row is ${status}: acknowledged`, async () => {
      const h = harness({
        markPaidResult: { ok: false, error: "Cannot transition" },
        admin: fakeAdmin({ status: { data: { status }, error: null } }),
      });
      const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
      assert.deepEqual(r, { ok: true, outcome: "already_settled" });
    });
  }

  test("markPaid refuses and the row still awaits payment: retryable error", async () => {
    const h = harness({
      markPaidResult: { ok: false, error: "db blip" },
      admin: fakeAdmin({ status: { data: { status: "payment_requested" }, error: null } }),
    });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.error.includes("db blip"));
    assert.ok(!r.ok && r.error.includes(TXN));
  });

  test("async_payment_succeeded after completed (second delivery) is already_settled", async () => {
    const h = harness({
      markPaidResult: { ok: false, error: "Cannot transition from 'paid'" },
      admin: fakeAdmin({ status: { data: { status: "paid" }, error: null } }),
    });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.async_payment_succeeded"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "already_settled" });
  });
});

describe("settleCheckoutPayment charge platform", () => {
  test("mx records the platform BEFORE markPaid", async () => {
    const order: string[] = [];
    const h = harness({
      order,
      recordChargePlatform: async (id, key) => {
        order.push(`record:${id}:${key}`);
        return true;
      },
    });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "mx", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.deepEqual(order, [`record:${TXN}:mx`, "markPaid"]);
  });

  test("mx fails closed when the platform cannot be recorded", async () => {
    const h = harness({ recordChargePlatform: async () => false });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "mx", h.deps);
    assert.equal(r.ok, false);
    assert.equal(h.paidWith.length, 0);
  });

  test("us settlement of a row recorded as mx still pays (alert is only logged)", async () => {
    const h = harness({ loadChargePlatformForTransaction: async () => "mx" });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "paid" });
    assert.equal(h.paidWith.length, 1);
  });
});

describe("extractChargedAmount", () => {
  test("checkout.session.completed reads amount_total and currency", () => {
    assert.deepEqual(extractChargedAmount(sessionEvent("checkout.session.completed")), { amountCents: 101500, currency: "mxn" });
  });

  test("async_payment_succeeded reads amount_total and currency", () => {
    assert.deepEqual(extractChargedAmount(sessionEvent("checkout.session.async_payment_succeeded", 500, "usd")), {
      amountCents: 500,
      currency: "usd",
    });
  });

  test("payment_intent.succeeded reads amount and currency", () => {
    assert.deepEqual(extractChargedAmount(intentEvent(2500, "usd")), { amountCents: 2500, currency: "usd" });
  });

  test("other event types yield null", () => {
    const e = { id: "evt_x", type: "charge.refunded", data: { object: {} } } as unknown as Stripe.Event;
    assert.equal(extractChargedAmount(e), null);
  });

  test("missing amounts become 0 and empty currency", () => {
    assert.deepEqual(extractChargedAmount(sessionEvent("checkout.session.completed", null, null)), { amountCents: 0, currency: "" });
    assert.deepEqual(extractChargedAmount(intentEvent(null, null)), { amountCents: 0, currency: "" });
  });
});
