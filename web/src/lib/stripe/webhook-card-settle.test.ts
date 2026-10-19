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
import type { PaymentReviewFlagInput } from "@/lib/payments/payment-review-flags-model";

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
              // The post-markPaid re-read selects `status, ...`; the guard selects amounts first.
              return { maybeSingle: async () => (cols.startsWith("status") ? status : guard) };
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
  flagResult?: { ok: true; created: boolean } | { ok: false; error: string };
};

function harness(over: HarnessOptions = {}) {
  const paidWith: Array<{ id: string; opts: { paymentIntentId?: string | null } | undefined }> = [];
  const flags: Array<{ id: string; flag: PaymentReviewFlagInput }> = [];
  const advanced: string[] = [];
  const deps: Partial<SettleDeps> = {
    markPaid: async (id, opts) => {
      over.order?.push("markPaid");
      paidWith.push({ id, opts });
      return over.markPaidResult ?? { ok: true };
    },
    recordChargePlatform: over.recordChargePlatform ?? (async () => true),
    loadChargePlatformForTransaction: over.loadChargePlatformForTransaction ?? (async () => "us"),
    getAdmin: () => (over.admin === undefined ? fakeAdmin({}) : over.admin),
    advanceDraft: async (_sb, id) => {
      advanced.push(id);
      return { ok: true, advanced: false };
    },
    flagPayment: async (id, flag) => {
      flags.push({ id, flag });
      return over.flagResult ?? { ok: true, created: true };
    },
  };
  return { deps, paidWith, flags, advanced };
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

  test("TUL-1283: an amount mismatch writes exactly one reconciliation flag with both amounts", async () => {
    const h = harness();
    await settleCheckoutPayment(sessionEvent("checkout.session.completed", 90000), ACTION, "us", h.deps);
    assert.equal(h.flags.length, 1);
    assert.equal(h.flags[0]!.id, TXN);
    assert.deepEqual(h.flags[0]!.flag, {
      reason: "amount_mismatch",
      paymentIntentId: PI,
      otherPaymentIntentId: null,
      expectedAmountCents: 101500,
      expectedCurrency: "MXN",
      chargedAmountCents: 90000,
      chargedCurrency: "mxn",
      rowStatus: null,
      stripeEventId: "evt_test_session",
    });
    assert.equal(h.advanced.length, 0, "a mismatched row is not advanced either");
  });

  test("TUL-1283: a currency mismatch is flagged too", async () => {
    const h = harness();
    await settleCheckoutPayment(intentEvent(101500, "usd"), ACTION, "us", h.deps);
    assert.equal(h.flags.length, 1);
    assert.equal(h.flags[0]!.flag.reason, "amount_mismatch");
    assert.equal(h.flags[0]!.flag.chargedCurrency, "usd");
  });

  test("TUL-1283: when the flag cannot be written the delivery retries (the flag must be durable)", async () => {
    const h = harness({ flagResult: { ok: false, error: "db down" } });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed", 90000), ACTION, "us", h.deps);
    assert.equal(r.ok, false);
    assert.equal(h.paidWith.length, 0);
  });

  test("a matching amount writes no flag", async () => {
    const h = harness();
    await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.equal(h.flags.length, 0);
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

function guardRow(status: string, paidBy: string | null = null, amount = 101500): Row {
  return {
    data: {
      gross_amount_cents: amount,
      currency: "MXN",
      status,
      provider_metadata: paidBy ? { payment_intent_id: paidBy } : {},
    },
    error: null,
  };
}

describe("TUL-1284: a charge on a cancelled or failed row is flagged for refund", () => {
  for (const status of ["cancelled", "failed"]) {
    test(`row already ${status}: one refund flag, no markPaid, no retry`, async () => {
      const h = harness({ admin: fakeAdmin({ guard: guardRow(status) }) });
      const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
      assert.deepEqual(r, { ok: true, outcome: "charge_on_inactive_row" });
      assert.equal(h.paidWith.length, 0, "the row is never marked paid");
      assert.equal(h.advanced.length, 0);
      assert.equal(h.flags.length, 1);
      assert.equal(h.flags[0]!.flag.reason, "charge_on_inactive_row");
      assert.equal(h.flags[0]!.flag.rowStatus, status);
      assert.equal(h.flags[0]!.flag.paymentIntentId, PI);
      assert.equal(h.flags[0]!.flag.chargedAmountCents, 101500);
    });
  }

  test("an inactive row with a different amount is still a refund flag (not a mismatch)", async () => {
    const h = harness({ admin: fakeAdmin({ guard: guardRow("cancelled", null, 50000) }) });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "charge_on_inactive_row" });
    assert.equal(h.flags[0]!.flag.reason, "charge_on_inactive_row");
  });

  test("row cancelled between the guard read and markPaid: flagged, not retried for three days", async () => {
    const h = harness({
      markPaidResult: { ok: false, error: "Cannot transition from 'cancelled' to 'paid'." },
      admin: fakeAdmin({
        guard: guardRow("payment_requested"),
        status: { data: { status: "cancelled", provider_metadata: {} }, error: null },
      }),
    });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "charge_on_inactive_row" });
    assert.equal(h.flags.length, 1);
    assert.equal(h.flags[0]!.flag.reason, "charge_on_inactive_row");
  });

  test("the refund flag cannot be written: retry", async () => {
    const h = harness({ admin: fakeAdmin({ guard: guardRow("cancelled") }), flagResult: { ok: false, error: "x" } });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.equal(r.ok, false);
  });

  test("a charge on a paid row with the same PaymentIntent writes no refund flag", async () => {
    const h = harness({ admin: fakeAdmin({ guard: guardRow("paid", PI) }) });
    const r = await settleCheckoutPayment(sessionEvent("checkout.session.completed"), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "already_settled" });
    assert.equal(h.flags.length, 0);
  });
});

describe("TUL-1268 M2: a second, different PaymentIntent on a paid row is a duplicate charge", () => {
  for (const status of ["paid", "payout_pending", "payout_sent"]) {
    test(`row ${status} by pi_first, pi_test_123 arrives: duplicate_charge flag with both ids`, async () => {
      const h = harness({ admin: fakeAdmin({ guard: guardRow(status, "pi_first") }) });
      const r = await settleCheckoutPayment(intentEvent(), ACTION, "us", h.deps);
      assert.deepEqual(r, { ok: true, outcome: "duplicate_charge" });
      assert.equal(h.paidWith.length, 0, "markPaid never runs twice");
      assert.equal(h.flags.length, 1);
      assert.equal(h.flags[0]!.flag.reason, "duplicate_charge");
      assert.equal(h.flags[0]!.flag.paymentIntentId, PI);
      assert.equal(h.flags[0]!.flag.otherPaymentIntentId, "pi_first");
    });
  }

  test("a paid row with a different PaymentIntent AND a different amount is a duplicate, not a mismatch", async () => {
    const h = harness({ admin: fakeAdmin({ guard: guardRow("paid", "pi_first", 50000) }) });
    const r = await settleCheckoutPayment(intentEvent(), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "duplicate_charge" });
    assert.equal(h.flags[0]!.flag.reason, "duplicate_charge");
  });

  test("the same PaymentIntent replayed on a paid row: already_settled, no flag", async () => {
    const h = harness({ admin: fakeAdmin({ guard: guardRow("paid", PI) }) });
    const r = await settleCheckoutPayment(intentEvent(), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "already_settled" });
    assert.equal(h.flags.length, 0);
  });

  test("a paid row with no recorded PaymentIntent cannot be compared: already_settled, no flag", async () => {
    const h = harness({ admin: fakeAdmin({ guard: guardRow("paid", null) }) });
    const r = await settleCheckoutPayment(intentEvent(), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "already_settled" });
    assert.equal(h.flags.length, 0);
  });

  test("race: the other PaymentIntent wins markPaid first, the loser is flagged as a duplicate", async () => {
    const h = harness({
      markPaidResult: { ok: false, error: "Already transitioned" },
      admin: fakeAdmin({
        guard: guardRow("payment_requested"),
        status: { data: { status: "paid", provider_metadata: { payment_intent_id: "pi_first" } }, error: null },
      }),
    });
    const r = await settleCheckoutPayment(intentEvent(), ACTION, "us", h.deps);
    assert.deepEqual(r, { ok: true, outcome: "duplicate_charge" });
    assert.equal(h.flags.length, 1);
    assert.equal(h.flags[0]!.flag.otherPaymentIntentId, "pi_first");
  });

  test("the duplicate flag cannot be written: retry", async () => {
    const h = harness({ admin: fakeAdmin({ guard: guardRow("paid", "pi_first") }), flagResult: { ok: false, error: "x" } });
    const r = await settleCheckoutPayment(intentEvent(), ACTION, "us", h.deps);
    assert.equal(r.ok, false);
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
