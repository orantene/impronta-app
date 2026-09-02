/**
 * Tests for the invoice mapping.
 *
 * The tax sum gets particular attention: `total_taxes` is an ARRAY in this API
 * version, not the scalar `tax` field older integrations used. Reading it as a
 * scalar would silently record zero tax on every invoice — which happens to be
 * the correct answer today, and would stop being correct the moment Stripe Tax
 * is switched on, without anything failing.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { mapInvoice, sumInvoiceTaxCents } from "./provider-invoices";

type AnyInvoice = Parameters<typeof mapInvoice>[0];

function invoice(over: Record<string, unknown> = {}): AnyInvoice {
  return {
    id: "in_1",
    object: "invoice",
    number: "INV-0001",
    customer: "cus_1",
    currency: "usd",
    status: "paid",
    collection_method: "charge_automatically",
    billing_reason: "subscription_cycle",
    subtotal: 7_900,
    total: 7_900,
    amount_paid: 7_900,
    amount_due: 7_900,
    amount_remaining: 0,
    pre_payment_credit_notes_amount: 0,
    post_payment_credit_notes_amount: 0,
    attempt_count: 0,
    created: 1_780_000_000,
    period_start: 1_780_000_000,
    period_end: 1_782_592_000,
    total_taxes: null,
    automatic_tax: { enabled: false, status: null },
    status_transitions: { finalized_at: 1_780_000_100, paid_at: 1_780_000_200 },
    ...over,
  } as unknown as AnyInvoice;
}

const NO_LINK = { tenantId: null, talentProfileId: null };
const EVT = { id: "evt_1", type: "invoice.paid" };

describe("sumInvoiceTaxCents", () => {
  test("no tax array means zero, which is every invoice today", () => {
    assert.equal(sumInvoiceTaxCents(invoice()), 0);
    assert.equal(sumInvoiceTaxCents(invoice({ total_taxes: [] })), 0);
  });

  test("sums the array rather than reading a scalar", () => {
    // The whole point: a scalar read would return 0 here and look fine.
    const inv = invoice({
      total_taxes: [
        { amount: 640, taxable_amount: 7_900 },
        { amount: 110, taxable_amount: 7_900 },
      ],
    });
    assert.equal(sumInvoiceTaxCents(inv), 750);
  });

  test("a malformed entry contributes zero rather than NaN", () => {
    // NaN would propagate into the row and fail the write, or worse, land as
    // null and quietly understate tax.
    const inv = invoice({ total_taxes: [{ amount: 500 }, { amount: undefined }, {}] });
    assert.equal(sumInvoiceTaxCents(inv), 500);
  });
});

describe("mapInvoice", () => {
  test("carries the money fields across unchanged", () => {
    const row = mapInvoice(invoice(), NO_LINK, EVT);
    assert.equal(row.subtotal_cents, 7_900);
    assert.equal(row.total_cents, 7_900);
    assert.equal(row.amount_paid_cents, 7_900);
    assert.equal(row.amount_remaining_cents, 0);
    assert.equal(row.currency, "USD");
  });

  test("records tax from the array", () => {
    const row = mapInvoice(invoice({ total_taxes: [{ amount: 750 }] }), NO_LINK, EVT);
    assert.equal(row.tax_cents, 750);
  });

  test("records whether Stripe Tax was active for this invoice", () => {
    // Makes "were we collecting tax then?" answerable per invoice rather than
    // by guessing at a switch-on date.
    const off = mapInvoice(invoice(), NO_LINK, EVT);
    assert.equal(off.automatic_tax_enabled, false);

    const on = mapInvoice(
      invoice({ automatic_tax: { enabled: true, status: "complete" } }),
      NO_LINK,
      EVT,
    );
    assert.equal(on.automatic_tax_enabled, true);
    assert.equal(on.automatic_tax_status, "complete");
  });

  test("credit notes are captured from the invoice, not a separate lookup", () => {
    const row = mapInvoice(
      invoice({
        pre_payment_credit_notes_amount: 1_000,
        post_payment_credit_notes_amount: 2_500,
      }),
      NO_LINK,
      EVT,
    );
    assert.equal(row.pre_payment_credit_notes_cents, 1_000);
    assert.equal(row.post_payment_credit_notes_cents, 2_500);
  });

  test("dunning fields survive, since they are the churn signal", () => {
    const row = mapInvoice(
      invoice({ status: "open", attempt_count: 3, next_payment_attempt: 1_780_500_000 }),
      NO_LINK,
      EVT,
    );
    assert.equal(row.attempt_count, 3);
    assert.equal(row.next_payment_attempt, new Date(1_780_500_000 * 1000).toISOString());
  });

  test("lifecycle timestamps come from status_transitions", () => {
    const row = mapInvoice(invoice(), NO_LINK, EVT);
    assert.equal(row.finalized_at, new Date(1_780_000_100 * 1000).toISOString());
    assert.equal(row.paid_at, new Date(1_780_000_200 * 1000).toISOString());
    assert.equal(row.voided_at, null);
  });

  test("a voided invoice records its void time", () => {
    const row = mapInvoice(
      invoice({
        status: "void",
        status_transitions: { finalized_at: 1_780_000_100, voided_at: 1_780_000_300 },
      }),
      NO_LINK,
      EVT,
    );
    assert.equal(row.status, "void");
    assert.equal(row.voided_at, new Date(1_780_000_300 * 1000).toISOString());
    assert.equal(row.paid_at, null);
  });

  test("the subscription id is read from parent.subscription_details", () => {
    // This is the 2025+ invoice shape. The older top-level `subscription` field
    // does not exist in this API version.
    const row = mapInvoice(
      invoice({ parent: { subscription_details: { subscription: "sub_123" } } }),
      NO_LINK,
      EVT,
    );
    assert.equal(row.stripe_subscription_id, "sub_123");
  });

  test("an invoice with no subscription stores null rather than guessing", () => {
    const row = mapInvoice(invoice({ parent: null }), NO_LINK, EVT);
    assert.equal(row.stripe_subscription_id, null);
  });

  test("linkage is carried through as given", () => {
    const row = mapInvoice(invoice(), { tenantId: "t1", talentProfileId: null }, EVT);
    assert.equal(row.tenant_id, "t1");
    assert.equal(row.talent_profile_id, null);
  });

  test("the triggering event is recorded so a stale write is diagnosable", () => {
    const row = mapInvoice(invoice(), NO_LINK, { id: "evt_9", type: "invoice.voided" });
    assert.equal(row.last_event_id, "evt_9");
    assert.equal(row.last_event_type, "invoice.voided");
  });
});
