import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rentReversalCents } from "./rent-autopay-refunds";

const base = { chargeCents: 121_800, transferCents: 120_000, alreadyReversedCents: 0, refundedCents: 0, lostDisputeCents: 0 };

describe("how much of the studio's transfer comes back", () => {
  test("a full refund reverses the studio's whole share; the fee is the platform's side", () => {
    assert.equal(rentReversalCents({ ...base, refundedCents: 121_800 }), 120_000);
  });
  test("a partial refund reverses the proportional share, rounded down", () => {
    assert.equal(rentReversalCents({ ...base, refundedCents: 60_900 }), 60_000);
    assert.equal(rentReversalCents({ ...base, refundedCents: 1 }), 0, "never more than its share");
  });
  test("cumulative: a second partial refund reverses only the difference; a replay reverses nothing", () => {
    assert.equal(rentReversalCents({ ...base, refundedCents: 121_800, alreadyReversedCents: 60_000 }), 60_000);
    assert.equal(rentReversalCents({ ...base, refundedCents: 60_900, alreadyReversedCents: 60_000 }), 0);
  });
  test("a lost dispute reverses the share of the disputed amount; refund + dispute never exceed the charge", () => {
    assert.equal(rentReversalCents({ ...base, lostDisputeCents: 121_800 }), 120_000);
    assert.equal(rentReversalCents({ ...base, refundedCents: 60_900, lostDisputeCents: 121_800, alreadyReversedCents: 60_000 }), 60_000);
  });
  test("no transfer, no charge, or bad numbers: nothing is reversed", () => {
    assert.equal(rentReversalCents({ ...base, transferCents: 0, refundedCents: 100 }), 0);
    assert.equal(rentReversalCents({ ...base, chargeCents: 0, refundedCents: 100 }), 0);
    assert.equal(rentReversalCents({ ...base, refundedCents: -5 }), 0);
    assert.equal(rentReversalCents({ ...base, refundedCents: 1.5 }), 0);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("wiring (TUL-1611)", () => {
  const server = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-autopay.server.ts"), "utf8");
  const handler = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
  test("refunds and disputes are checked for a rent charge BEFORE the normal routing, which still runs after", () => {
    const pre = handler.indexOf("handleRentChargeEvent(sbRent, stripe, event)");
    assert.ok(pre > 0 && pre < handler.indexOf("const action = classifyStripeEvent(event)"));
    assert.match(handler, /"charge\.refunded" \|\| event\.type === "charge\.dispute\.created" \|\| event\.type === "charge\.dispute\.closed"/);
  });
  test("a charge is a rent charge only through its own invoice: PaymentIntent -> invoice payment -> our row by Stripe invoice id", () => {
    assert.match(server, /invoicePayments\.list\(\{ payment: \{ type: "payment_intent", payment_intent: pi \}/);
    assert.match(server, /\.eq\("stripe_invoice_id", invoiceId\)/);
  });
  test("reversals are computed by rentReversalCents and idempotency-keyed by the cumulative target", () => {
    assert.match(server, /rentReversalCents\(\{/);
    assert.match(server, /idempotencyKey: `rent_reverse_\$\{transferId\}_\$\{target\}`/);
  });
  test("only a LOST dispute reverses; a new dispute flags the row and tells the owner", () => {
    assert.match(server, /dispute\.status === "lost"/);
    assert.match(server, /type: "rent\.autopay_disputed"/);
  });
});

describe("the held migration (TUL-1611)", () => {
  const sql = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231423040_studio_rent_refunds_tul1611.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  test("records refunds and disputes on the month's row and allows the 'refunded' status", () => {
    assert.match(sql, /refunded_cents integer NOT NULL DEFAULT 0 CHECK \(refunded_cents >= 0\)/);
    assert.match(sql, /disputed_at timestamptz NULL/);
    assert.match(sql, /dispute_lost_at timestamptz NULL/);
    assert.match(sql, /CHECK \(status IN \('issuing','issued','paid','failed','void','refunded'\)\)/);
  });
  test("the migration already on main is untouched", () => {
    assert.doesNotMatch(readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231420700_studio_rent_tul1376.sql"), "utf8"), /refunded_cents/);
  });
});
