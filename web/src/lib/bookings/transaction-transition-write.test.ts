/**
 * E1 review fix: two settlements racing for one money row must produce exactly
 * one paid transition and one set of side effects.
 *
 * Hosted Checkout sends `checkout.session.completed` and the companion
 * `payment_intent.succeeded` (both carry the transaction id), and they can be
 * processed at the same time. Both pass `transitionStatus`'s read while the row
 * is still `payment_requested`; before this fix the UPDATE matched on `id` only
 * and the trigger allows `paid -> paid`, so both wrote and both fanned out.
 *
 * The fake database below is a single shared row whose UPDATE honours every
 * filter it is given, like PostgREST does. A barrier makes both callers read
 * before either writes, which is the interleaving the race needs.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { writeGuardedTransition } from "./transaction-transition-write";
import { settleCheckoutPayment, type SettleDeps } from "../stripe/webhook-card-settle";
import { classifyStripeEvent } from "../stripe/webhook-routing";

const TXN = "33333333-3333-4333-8333-333333333333";
const PI = "pi_test_race";
const GROSS = 101500;
const MARK_PAID_FROM = ["payment_requested", "pending", "disputed"] as const;

type Row = {
  id: string;
  status: string;
  gross_amount_cents: number;
  currency: string;
  net_amount_cents: number;
  /** markPaid records the settling PaymentIntent in the same write. */
  provider_metadata?: { payment_intent_id: string | null };
};

/** `writes` counts paid writes only (the draft advance is a separate, earlier step). */
type Db = { row: Row; writes: number; failUpdate?: boolean };

/** Shared-row fake: select(..).eq(id).maybeSingle() and update(..).eq(..).in(..).select(). */
function fakeDb(db: Db): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "booking_transactions");
      return {
        select(_cols: string) {
          return {
            eq(_c: string, v: string) {
              return { maybeSingle: async () => ({ data: v === db.row.id ? { ...db.row } : null, error: null }) };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const eqs: Array<[string, unknown]> = [];
          const ins: Array<[string, unknown[]]> = [];
          const chain = {
            eq(c: string, v: unknown) {
              eqs.push([c, v]);
              return chain;
            },
            in(c: string, vs: unknown[]) {
              ins.push([c, vs]);
              return chain;
            },
            async select(_cols: string) {
              if (db.failUpdate) return { data: null, error: { message: "connection reset" } };
              const r = db.row as unknown as Record<string, unknown>;
              const match = eqs.every(([c, v]) => r[c] === v) && ins.every(([c, vs]) => vs.includes(r[c]));
              if (!match) return { data: [], error: null };
              db.row = { ...db.row, ...(patch as Partial<Row>) };
              if (patch.status === "paid") db.writes += 1;
              return { data: [{ ...db.row }], error: null };
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

/** Resolves once `n` callers have arrived: forces read-read-write-write. */
function barrier(n: number) {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return async () => {
    arrived += 1;
    if (arrived >= n) release();
    await gate;
  };
}

describe("writeGuardedTransition", () => {
  test("two racing writers from payment_requested: exactly one wins, the other is already_transitioned", async () => {
    const db: Db = { row: { id: TXN, status: "payment_requested", gross_amount_cents: GROSS, currency: "MXN", net_amount_cents: 100000 }, writes: 0 };
    const sb = fakeDb(db);
    const input = { transactionId: TXN, fromStatuses: MARK_PAID_FROM, patch: { status: "paid" } };
    const [a, b] = await Promise.all([writeGuardedTransition(sb, input), writeGuardedTransition(sb, input)]);
    assert.equal([a, b].filter((r) => r.ok).length, 1);
    assert.equal([a, b].filter((r) => !r.ok && r.alreadyTransitioned).length, 1);
    assert.equal(db.writes, 1);
    assert.equal(db.row.status, "paid");
  });

  test("a write error is an error, not already_transitioned", async () => {
    const db: Db = { row: { id: TXN, status: "payment_requested", gross_amount_cents: GROSS, currency: "MXN", net_amount_cents: 100000 }, writes: 0, failUpdate: true };
    const r = await writeGuardedTransition(fakeDb(db), { transactionId: TXN, fromStatuses: MARK_PAID_FROM, patch: { status: "paid" } });
    assert.deepEqual(r, { ok: false, alreadyTransitioned: false, error: { message: "connection reset" } });
  });
});

function sessionCompleted(): Stripe.Event {
  return {
    id: "evt_cs_completed",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_race", object: "checkout.session", mode: "payment", payment_status: "paid",
        client_reference_id: TXN, metadata: { transaction_id: TXN }, payment_intent: PI,
        amount_total: GROSS, currency: "mxn",
      },
    },
  } as unknown as Stripe.Event;
}

function intentSucceeded(): Stripe.Event {
  return {
    id: "evt_pi_succeeded",
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    data: { object: { id: PI, object: "payment_intent", amount: GROSS, currency: "mxn", metadata: { transaction_id: TXN } } },
  } as unknown as Stripe.Event;
}

describe("parallel settle: completed + payment_intent.succeeded on one row", () => {
  for (const start of ["draft", "payment_requested"] as const) {
    test(`from ${start}: one paid transition, one set of side effects, the other already_settled`, async () => {
      const db: Db = { row: { id: TXN, status: start, gross_amount_cents: GROSS, currency: "MXN", net_amount_cents: 100000 }, writes: 0 };
      const sb = fakeDb(db);
      const sideEffects: string[] = [];
      const bothRead = barrier(2);
      // markPaid as transitionStatus does it: read, check from-set, guarded write,
      // and only on a won write run the follow-ons (emails, notice, card, audit).
      const deps: Partial<SettleDeps> = {
        getAdmin: () => sb,
        loadChargePlatformForTransaction: async () => "us",
        recordChargePlatform: async () => true,
        markPaid: async (id, opts) => {
          const { data } = await sb.from("booking_transactions").select("status").eq("id", id).maybeSingle();
          await bothRead();
          const status = String((data as { status: string } | null)?.status);
          if (!(MARK_PAID_FROM as readonly string[]).includes(status)) return { ok: false, error: `Cannot transition from '${status}' to 'paid'.` };
          const w = await writeGuardedTransition(sb, {
            transactionId: id,
            fromStatuses: MARK_PAID_FROM,
            patch: { status: "paid", provider_metadata: { payment_intent_id: opts?.paymentIntentId ?? null } },
          });
          if (!w.ok) return { ok: false, error: w.alreadyTransitioned ? "already transitioned" : w.error.message };
          sideEffects.push("confirm+notify+card+audit");
          return { ok: true };
        },
      };
      const run = (e: Stripe.Event) => {
        const action = classifyStripeEvent(e);
        assert.equal(action.kind, "booking_payment");
        if (action.kind !== "booking_payment") throw new Error("unreachable");
        return settleCheckoutPayment(e, action, "us", deps);
      };
      const results = await Promise.all([run(sessionCompleted()), run(intentSucceeded())]);
      const outcomes = results.map((r) => (r.ok ? r.outcome : `error:${r.error}`)).sort();
      assert.deepEqual(outcomes, ["already_settled", "paid"]);
      assert.equal(db.writes, 1, "one paid write");
      assert.deepEqual(sideEffects, ["confirm+notify+card+audit"]);
      assert.equal(db.row.status, "paid");
      assert.equal(db.row.gross_amount_cents, GROSS, "amount unchanged");
    });
  }
});

describe("transitionStatus wiring (static)", () => {
  const src = readFileSync(join(__dirname, "transactions.ts"), "utf8");
  const body = src.slice(src.indexOf("async function transitionStatus("));
  const fn = body.slice(0, body.indexOf("\n}\n") + 3);

  test("the status write goes through writeGuardedTransition with the from-set", () => {
    assert.match(fn, /writeGuardedTransition\(sb, \{[\s\S]*fromStatuses: fromArr/);
  });

  test("no unguarded update on id alone remains in transitionStatus", () => {
    assert.doesNotMatch(fn, /\.update\(/);
  });

  test("a lost race returns an already_transitioned failure (callers gate every side effect on ok)", () => {
    assert.match(fn, /code: "already_transitioned"/);
  });
});
