import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { invoiceDisplayState } from "./invoice-display";

describe("invoice list status (TUL-1232)", () => {
  test("paid stays paid, whatever the attempt count", () => {
    assert.equal(invoiceDisplayState({ status: "paid", attemptCount: 3 }).failed, false);
  });

  test("an open invoice Stripe already tried to charge is a FAILED charge, not 'unpaid'", () => {
    const s = invoiceDisplayState({ status: "open", attemptCount: 1, nextAttemptAt: "2026-10-22T10:00:00Z" });
    assert.equal(s.failed, true);
    assert.equal(s.nextAttemptAt, "2026-10-22T10:00:00Z");
  });

  test("uncollectible after attempts is failed with no retry date", () => {
    const s = invoiceDisplayState({ status: "uncollectible", attemptCount: 4, nextAttemptAt: "2026-10-22T10:00:00Z" });
    assert.equal(s.failed, true);
    assert.equal(s.nextAttemptAt, null);
  });

  test("a brand-new open invoice (no attempt yet), void and draft are not failed", () => {
    for (const status of ["open", "void", "draft", null]) {
      assert.equal(invoiceDisplayState({ status, attemptCount: 0 }).failed, false);
    }
  });

  test("a pending 3DS / authentication step is 'needs action', not a failed charge", () => {
    for (const intentStatus of ["requires_action", "requires_confirmation"]) {
      const s = invoiceDisplayState({ status: "open", attemptCount: 1, intentStatus });
      assert.equal(s.needsAction, true);
      assert.equal(s.failed, false);
    }
    const declined = invoiceDisplayState({ status: "open", attemptCount: 1, intentStatus: "requires_payment_method" });
    assert.equal(declined.failed, true);
    assert.equal(declined.needsAction, false);
    // Unknown intent status (lookup failed) stays the safe default: failed.
    assert.equal(invoiceDisplayState({ status: "open", attemptCount: 1, intentStatus: null }).failed, true);
    // Never for a paid or void invoice.
    assert.equal(invoiceDisplayState({ status: "paid", attemptCount: 1, intentStatus: "requires_action" }).needsAction, false);
  });

  test("the card shows 'Payment failed', the reason and an Update card link, in ES and EN", () => {
    const card = readFileSync(new URL("../../app/(workspace)/[tenantSlug]/talent/settings/TalentBillingCard.tsx", import.meta.url), "utf8");
    assert.match(card, /copy\.t\("Payment failed"\)/);
    assert.match(card, /copy\.t\("Update card"\)/);
    const es = readFileSync(new URL("../../components/admin/shell/internal/dashboard-i18n-billing.ts", import.meta.url), "utf8");
    assert.match(card, /copy\.t\("Needs action"\)/);
    for (const k of ["Payment failed", "Update card", "Your card could not be charged.", "Needs action", "Confirm payment"]) assert.match(es, new RegExp(`"${k}":`));
  });
});

import { isZeroNoChargeInvoice } from "./invoice-display";

test("TUL-834: paid or void $0 start invoices are hidden, real problems are kept", () => {
  assert.equal(isZeroNoChargeInvoice({ status: "paid", totalCents: 0 }), true);
  assert.equal(isZeroNoChargeInvoice({ status: "void", totalCents: 0, attemptCount: 0 }), true);
  assert.equal(isZeroNoChargeInvoice({ status: "paid", totalCents: 1500 }), false);
  assert.equal(isZeroNoChargeInvoice({ status: "open", totalCents: 0, attemptCount: 1 }), false);
  assert.equal(isZeroNoChargeInvoice({ status: "uncollectible", totalCents: 0 }), false);
});
