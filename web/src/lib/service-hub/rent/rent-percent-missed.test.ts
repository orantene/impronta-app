/** TUL-1701: a percentage the automatic invoice cannot carry is marked and announced, never lost silently. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type Stripe from "stripe";
import { addPercentToDraft } from "./rent-autopay.server";

const DEC1 = Date.UTC(2026, 11, 1) / 1000;
const draft = { type: "draft", planId: "plan-1", tenantId: "t-1", subscriptionId: "sub_1", invoiceId: "in_1", customerId: "cus_1", periodStart: DEC1, currency: "mxn", percentAdded: false, feeBps: 150 } as never;
const planRow = { stripe_subscription_id: "sub_1", rent_percent_bps: 1_000, accepted_percent_bps: 1_000, currency: "MXN", talent_profile_id: "tp-1", autopay_first_period: "2026-11", autopay_skip_periods: [], autopay_percent_missed: [] };

function fake(invoice: Record<string, unknown>, missed: string[] = []) {
  const updates: Array<Record<string, unknown>> = [];
  const items: string[] = [];
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q,
    update: (v: Record<string, unknown>) => { updates.push(v); return q; },
    maybeSingle: async () => ({ data: { ...planRow, autopay_percent_missed: missed }, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
  });
  const stripe = { invoices: { retrieve: async () => invoice, update: async () => ({}) }, invoiceItems: { create: async () => { items.push("item"); return {}; } } } as unknown as Stripe;
  return { admin: { from: () => q } as never, stripe, updates, items };
}

const prev = process.env.RENT_AUTOPAY_PERCENT_ENABLED;
beforeEach(() => { process.env.RENT_AUTOPAY_PERCENT_ENABLED = "1"; });
afterEach(() => { if (prev === undefined) delete process.env.RENT_AUTOPAY_PERCENT_ENABLED; else process.env.RENT_AUTOPAY_PERCENT_ENABLED = prev; });

describe("a month the percentage could not be added to", () => {
  test("an invoice already finalized (open): the month is marked and nothing is added", async () => {
    const f = fake({ status: "open", metadata: {} });
    assert.equal(await addPercentToDraft(f.admin, f.stripe, draft), "skipped");
    assert.deepEqual(f.updates, [{ autopay_percent_missed: ["2026-11"] }]);
    assert.deepEqual(f.items, []);
  });
  test("the percentage switch turned OFF after being on: the month is marked, not silently left", async () => {
    delete process.env.RENT_AUTOPAY_PERCENT_ENABLED;
    const f = fake({ status: "draft", metadata: {} });
    assert.equal(await addPercentToDraft(f.admin, f.stripe, draft), "skipped");
    assert.deepEqual(f.updates, [{ autopay_percent_missed: ["2026-11"] }]);
    assert.deepEqual(f.items, []);
  });
  test("an already stamped invoice is done: no mark, no items", async () => {
    const f = fake({ status: "open", metadata: { rent_percent_cents: "100" } });
    assert.equal(await addPercentToDraft(f.admin, f.stripe, draft), "skipped");
    assert.deepEqual(f.updates, []);
  });
  test("a month already marked is not marked (or announced) twice", async () => {
    const f = fake({ status: "open", metadata: {} }, ["2026-11"]);
    await addPercentToDraft(f.admin, f.stripe, draft);
    assert.deepEqual(f.updates, []);
  });
  test("a month the owner recorded as paid outside is skipped quietly, not marked", async () => {
    const f = fake({ status: "open", metadata: {} });
    const orig = planRow.autopay_skip_periods;
    (planRow as { autopay_skip_periods: string[] }).autopay_skip_periods = ["2026-11"];
    try {
      assert.equal(await addPercentToDraft(f.admin, f.stripe, draft), "skipped");
      assert.deepEqual(f.updates, []);
    } finally {
      (planRow as { autopay_skip_periods: string[] }).autopay_skip_periods = orig;
    }
  });
});
