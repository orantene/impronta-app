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

  test("the card shows 'Payment failed', the reason and an Update card link, in ES and EN", () => {
    const card = readFileSync(new URL("../../app/(workspace)/[tenantSlug]/talent/settings/TalentBillingCard.tsx", import.meta.url), "utf8");
    assert.match(card, /copy\.t\("Payment failed"\)/);
    assert.match(card, /copy\.t\("Update card"\)/);
    const es = readFileSync(new URL("../../components/admin/shell/internal/dashboard-i18n-billing.ts", import.meta.url), "utf8");
    for (const k of ["Payment failed", "Update card", "Your card could not be charged."]) assert.match(es, new RegExp(`"${k}":`));
  });
});
