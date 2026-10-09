/**
 * TUL-144: each Stripe refund is booked once, under its own id and slice,
 * even when the event does not carry charge.refunds.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/payments/refund-event-resolve.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { bookAfterLostRace, pickNextUnrecordedRefund, resolveRefundForEvent, type StripeRefundLite } from "./refund-event-resolve";

const r = (id: string, amount: number, created: number, status = "succeeded"): StripeRefundLite => ({ id, amount, status, created });

test("the oldest unrecorded refund is next; recorded ones are skipped", () => {
  const refunds = [r("re_b", 20000, 200), r("re_a", 30000, 100)];
  assert.equal(pickNextUnrecordedRefund(refunds, [])?.id, "re_a");
  assert.equal(pickNextUnrecordedRefund(refunds, [{ provider_refund_id: "re_a", gross_amount_cents: 30000 }])?.id, "re_b");
  assert.equal(
    pickNextUnrecordedRefund(refunds, [
      { provider_refund_id: "re_a", gross_amount_cents: 30000 },
      { provider_refund_id: "re_b", gross_amount_cents: 20000 },
    ]),
    null,
    "a redelivery finds nothing new",
  );
});

test("two DELIBERATE identical partials are two refunds, not one (distinct ids)", () => {
  const refunds = [r("re_1", 30000, 100), r("re_2", 30000, 200)];
  assert.equal(pickNextUnrecordedRefund(refunds, [])?.id, "re_1");
  const afterFirst = [{ provider_refund_id: "re_1", gross_amount_cents: 30000 }];
  assert.equal(pickNextUnrecordedRefund(refunds, afterFirst)?.id, "re_2", "the second identical partial is still booked");
});

test("a row booked before this fix without an id still counts as recorded (one per refund, matched by amount)", () => {
  const refunds = [r("re_1", 30000, 100), r("re_2", 30000, 200)];
  const legacy = [{ provider_refund_id: null, gross_amount_cents: 30000 }];
  assert.equal(pickNextUnrecordedRefund(refunds, legacy)?.id, "re_2", "the legacy row stands for re_1, re_2 is new");
  assert.equal(pickNextUnrecordedRefund([r("re_1", 30000, 100)], legacy), null, "a lone legacy partial is not booked twice");
});

test("failed or pending refunds are never booked", () => {
  assert.equal(pickNextUnrecordedRefund([r("re_x", 30000, 100, "failed"), r("re_y", 100, 101, "pending")], []), null);
});

function fakeSb(rows: Array<{ provider_refund_id: string | null; gross_amount_cents: number }>, fail = false) {
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.eq = () => api;
  api.then = (resolve: (v: unknown) => unknown) => resolve(fail ? { data: null, error: { message: "x" } } : { data: rows, error: null });
  return { from: () => api } as unknown as SupabaseClient;
}
const stripeWith = (data: StripeRefundLite[]) => ({ refunds: { list: async () => ({ data }) } });

test("resolveRefundForEvent: next / all_recorded / unavailable (Stripe or DB failure falls back, never throws)", async () => {
  const base = { chargeId: "ch_1", transactionId: "t1" };
  assert.deepEqual(
    await resolveRefundForEvent({ ...base, stripe: stripeWith([r("re_a", 30000, 100)]), sb: fakeSb([]) }),
    { kind: "next", refundId: "re_a", amountCents: 30000 },
  );
  assert.deepEqual(
    await resolveRefundForEvent({ ...base, stripe: stripeWith([r("re_a", 30000, 100)]), sb: fakeSb([{ provider_refund_id: "re_a", gross_amount_cents: 30000 }]) }),
    { kind: "all_recorded" },
  );
  assert.deepEqual(await resolveRefundForEvent({ ...base, stripe: stripeWith([r("re_a", 1, 1)]), sb: fakeSb([], true) }), { kind: "unavailable" });
  const throwing = { refunds: { list: async () => { throw new Error("stripe down"); } } };
  assert.deepEqual(await resolveRefundForEvent({ ...base, stripe: throwing, sb: fakeSb([]) }), { kind: "unavailable" });
});

test("handleBookingRefund resolves the refund first, and a full refund is never short-circuited on 'all recorded'", () => {
  const src = readFileSync("src/lib/payments/refunds.ts", "utf8");
  assert.match(src, /resolveRefundForEvent\(\{ stripe, sb: sbResolve/);
  assert.match(src, /if \(everyRefundRecorded\) return true;/);
  const partialBranch = src.slice(src.indexOf("if (!isFullRefund) {"), src.indexOf("const marked = await d.markRefunded"));
  assert.match(partialBranch, /everyRefundRecorded/);
  assert.doesNotMatch(src.slice(src.indexOf("const marked = await d.markRefunded") - 200, src.indexOf("const marked = await d.markRefunded")), /everyRefundRecorded/);
});

test("two events race for different refunds: both refunds end up booked", async () => {
  const stripeRefunds = [r("re_a", 30000, 100), r("re_b", 20000, 200)];
  const booked = new Map<string, number>();
  const resolve = async () => {
    const next = pickNextUnrecordedRefund(stripeRefunds, [...booked].map(([id, amt]) => ({ provider_refund_id: id, gross_amount_cents: amt })));
    return next ? ({ kind: "next", refundId: next.id, amountCents: next.amount } as const) : ({ kind: "all_recorded" } as const);
  };
  // The unique provider_refund_id: the second insert of the same id reports "not new".
  const book = async (id: string, amt: number) => {
    if (booked.has(id)) return false;
    booked.set(id, amt);
    return true;
  };
  // Both deliveries resolved BEFORE either booked, so both picked re_a.
  const first = await resolve();
  const second = await resolve();
  assert.equal(first.kind === "next" && second.kind === "next" && first.refundId === second.refundId, true);
  assert.equal(await book("re_a", 30000), true);
  assert.equal(await book("re_a", 30000), false); // loser of the race
  assert.equal(await bookAfterLostRace(resolve, book), true);
  assert.deepEqual([...booked.keys()].sort(), ["re_a", "re_b"]);
});

test("a plain redelivery that lost nothing books nothing more", async () => {
  const booked = new Map([["re_a", 30000]]);
  const resolve = async () => {
    const next = pickNextUnrecordedRefund([r("re_a", 30000, 100)], [...booked].map(([id, amt]) => ({ provider_refund_id: id, gross_amount_cents: amt })));
    return next ? ({ kind: "next", refundId: next.id, amountCents: next.amount } as const) : ({ kind: "all_recorded" } as const);
  };
  assert.equal(await bookAfterLostRace(resolve, async () => true), false);
});
