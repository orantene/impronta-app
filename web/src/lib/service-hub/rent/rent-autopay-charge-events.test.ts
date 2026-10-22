/**
 * TUL-1611 consultant fix: the rent refund/dispute check runs on EVERY platform refund and dispute event, so it must be
 * invisible to everything that is not a confirmed rent charge: flag-gated, never on Connect events, and any doubt is
 * "not rent" (a booking refund must still record normally). Only a CONFIRMED rent row can ask Stripe to retry.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type Stripe from "stripe";
import { handleRentChargeEvent } from "./rent-autopay.server";

const ev = (type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type, data: { object }, ...extra }) as unknown as Stripe.Event;
const refund = (extra: Record<string, unknown> = {}) => ev("charge.refunded", { id: "ch_1", payment_intent: "pi_1", amount: 121_800, amount_refunded: 121_800, transfer: "tr_1" }, extra);

function fakeAdmin(opts: { row?: Record<string, unknown> | null; error?: boolean; throwOnFrom?: boolean }) {
  const calls: string[] = [];
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, update: () => q,
    maybeSingle: async () => (opts.error ? { data: null, error: { code: "42P01", message: "relation does not exist" } } : { data: opts.row ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
  });
  return { calls, admin: { from: (t: string) => { calls.push(t); if (opts.throwOnFrom) throw new Error("boom"); return q; } } as never };
}
function fakeStripe(opts: { invoiceId?: string | null; listThrows?: boolean; reversalThrows?: boolean } = {}) {
  const calls: string[] = [];
  const stripe = {
    charges: { retrieve: async () => { calls.push("charges.retrieve"); return { id: "ch_1", payment_intent: "pi_1", amount: 121_800, amount_refunded: 0, transfer: "tr_1" }; } },
    invoicePayments: {
      list: async () => {
        calls.push("invoicePayments.list");
        if (opts.listThrows) throw new Error("stripe down");
        return { data: opts.invoiceId === null ? [] : [{ invoice: opts.invoiceId ?? "in_1" }] };
      },
    },
    transfers: {
      retrieve: async () => { calls.push("transfers.retrieve"); return { amount: 120_000, amount_reversed: 0 }; },
      createReversal: async () => { calls.push("createReversal"); if (opts.reversalThrows) throw new Error("stripe down"); return { id: "trr_1" }; },
    },
  } as never;
  return { stripe, calls };
}
const ROW = { id: "inv-row", tenant_id: "t-1", plan_id: "plan-1", period: "2026-11", talent_profile_id: "tp-1" };

const prev = process.env.RENT_AUTOPAY_ENABLED;
beforeEach(() => { process.env.RENT_AUTOPAY_ENABLED = "1"; });
afterEach(() => { if (prev === undefined) delete process.env.RENT_AUTOPAY_ENABLED; else process.env.RENT_AUTOPAY_ENABLED = prev; });

describe("invisible to everything that is not a confirmed rent charge", () => {
  test("flag OFF: nothing is read, nothing is asked of Stripe", async () => {
    delete process.env.RENT_AUTOPAY_ENABLED;
    const a = fakeAdmin({ row: ROW });
    const s = fakeStripe();
    assert.equal(await handleRentChargeEvent(a.admin, s.stripe, refund()), "not_rent");
    assert.deepEqual(a.calls, []);
    assert.deepEqual(s.calls, []);
  });
  test("a Connect-account event (event.account set) is never ours", async () => {
    const a = fakeAdmin({ row: ROW });
    const s = fakeStripe();
    assert.equal(await handleRentChargeEvent(a.admin, s.stripe, refund({ account: "acct_x" })), "not_rent");
    assert.deepEqual(a.calls.concat(s.calls), []);
  });
  test("a booking refund (charge not backed by an invoice) is not_rent and never retries", async () => {
    assert.equal(await handleRentChargeEvent(fakeAdmin({ row: ROW }).admin, fakeStripe({ invoiceId: null }).stripe, refund()), "not_rent");
  });
  test("an invoice-backed charge that is not in our rent table is not_rent", async () => {
    assert.equal(await handleRentChargeEvent(fakeAdmin({ row: null }).admin, fakeStripe().stripe, refund()), "not_rent");
  });
  test("the rent read FAILS (table or column missing on prod, any DB error): not_rent, the booking refund still records", async () => {
    assert.equal(await handleRentChargeEvent(fakeAdmin({ error: true }).admin, fakeStripe().stripe, refund()), "not_rent");
    assert.equal(await handleRentChargeEvent(fakeAdmin({ throwOnFrom: true }).admin, fakeStripe().stripe, refund()), "not_rent");
  });
  test("a Stripe failure BEFORE the rent row is confirmed is not_rent, not a 503", async () => {
    assert.equal(await handleRentChargeEvent(fakeAdmin({ row: ROW }).admin, fakeStripe({ listThrows: true }).stripe, refund()), "not_rent");
  });
});

describe("a confirmed rent row", () => {
  test("a refund reverses the studio's share", async () => {
    const s = fakeStripe();
    assert.equal(await handleRentChargeEvent(fakeAdmin({ row: ROW }).admin, s.stripe, refund()), "reversed");
    assert.ok(s.calls.includes("createReversal"));
  });
  test("only HERE can Stripe be asked to retry: a failed reversal on a confirmed rent row", async () => {
    assert.equal(await handleRentChargeEvent(fakeAdmin({ row: ROW }).admin, fakeStripe({ reversalThrows: true }).stripe, refund()), "retry");
  });
});

describe("wiring", () => {
  test("the webhook consults it only for refund/dispute events and throws only on retry", () => {
    const h = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
    assert.match(h, /=== "retry"\) throw new TransientWebhookError\("rent charge event: retry"\)/);
    const server = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-autopay.server.ts"), "utf8");
    assert.match(server, /if \(!rentAutopayFlagOn\(\)\) return "not_rent"/);
    assert.match(server, /if \(event\.account\) return "not_rent"/);
  });
});
