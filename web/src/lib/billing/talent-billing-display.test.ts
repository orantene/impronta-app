import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { translateDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  cardFromStripeObject,
  pickDefaultCard,
  talentBillingPlanLabel,
  talentPastDueView,
} from "./talent-billing-display";

// Fakes shaped like the expanded Stripe objects the Billing summary reads.
const pm4242 = { id: "pm_1", object: "payment_method", type: "card", card: { brand: "visa", last4: "4242" } };
const pm0341 = { id: "pm_2", object: "payment_method", type: "card", card: { brand: "visa", last4: "0341" } };
const legacyCard = { id: "card_1", object: "card", brand: "mastercard", last4: "4444" };
const sourceCard = { id: "src_1", object: "source", type: "card", card: { brand: "amex", last4: "8431" } };

describe("TUL-835 card on file lookup (display only)", () => {
  test("the subscription default payment method wins (Checkout subscriptions keep the card there)", () => {
    assert.deepEqual(
      pickDefaultCard({
        subscriptionDefaultPaymentMethod: pm0341,
        customerInvoiceDefaultPaymentMethod: pm4242,
        customerDefaultSource: legacyCard,
      }),
      { brand: "visa", last4: "0341" },
    );
  });

  test("falls back to the customer's invoice default when the subscription has none", () => {
    assert.deepEqual(
      pickDefaultCard({ subscriptionDefaultPaymentMethod: null, customerInvoiceDefaultPaymentMethod: pm4242 }),
      { brand: "visa", last4: "4242" },
    );
  });

  test("falls back to the customer's legacy default source (Card or card Source)", () => {
    assert.deepEqual(pickDefaultCard({ customerDefaultSource: legacyCard }), { brand: "mastercard", last4: "4444" });
    assert.deepEqual(pickDefaultCard({ customerDefaultSource: sourceCard }), { brand: "amex", last4: "8431" });
  });

  test("unexpanded ids, deleted objects and non-card methods are not a card", () => {
    assert.equal(cardFromStripeObject("pm_123"), null);
    assert.equal(cardFromStripeObject({ id: "pm_x", deleted: true }), null);
    assert.equal(cardFromStripeObject({ id: "pm_y", object: "payment_method", type: "link", card: null }), null);
    assert.equal(pickDefaultCard({ subscriptionDefaultPaymentMethod: "pm_123" }), null);
    assert.equal(pickDefaultCard({}), null);
  });

  test("invariance: the lookup never mutates the Stripe objects it reads", () => {
    const before = JSON.stringify([pm4242, pm0341, legacyCard]);
    pickDefaultCard({
      subscriptionDefaultPaymentMethod: pm0341,
      customerInvoiceDefaultPaymentMethod: pm4242,
      customerDefaultSource: legacyCard,
    });
    assert.equal(JSON.stringify([pm4242, pm0341, legacyCard]), before);
  });
});

describe("TUL-835 plan name in the Billing panel", () => {
  test("talent_portfolio reads Oficina Web in Spanish and Web Office in English, never Portfolio", () => {
    const label = talentBillingPlanLabel("talent_portfolio");
    assert.equal(label, "Web Office");
    assert.equal(translateDashboardText(label, "es"), "Oficina Web");
    assert.equal(translateDashboardText(label, "en"), "Web Office");
  });

  test("free and unknown keys", () => {
    assert.equal(talentBillingPlanLabel("talent_basic"), "Free");
    assert.equal(talentBillingPlanLabel("agency"), null);
    assert.equal(talentBillingPlanLabel(null), null);
  });
});

describe("TUL-835 talent past-due banner gate", () => {
  test("only a past_due subscription produces a banner", () => {
    assert.deepEqual(talentPastDueView({ status: "past_due", pastDueSince: "2026-10-18T00:00:00Z" }), {
      status: "past_due",
      pastDueSince: "2026-10-18T00:00:00Z",
    });
    for (const status of ["active", "trialing", "cancelled", "incomplete", null]) {
      assert.equal(talentPastDueView({ status, pastDueSince: "2026-10-18T00:00:00Z" }), null, String(status));
    }
    assert.equal(talentPastDueView(null), null);
  });
});
