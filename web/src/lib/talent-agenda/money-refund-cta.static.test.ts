/**
 * D-026: Money refund-pending rows call the real Stripe refund writer.
 * Static pins so we never ship a fake MoneyRefundSheet again (AUD-018) while
 * still having a talent-owned Refund CTA on Money.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Money refund CTA (D-026)", () => {
  it("MoneyHomePage refund-pending primary calls refundOwnBookingPayment", () => {
    const page = read("components/talent/money/MoneyHomePage.tsx");
    const line = read("components/talent/money/AgendaMoneyLine.tsx");
    assert.match(page, /refundOwnBookingPayment/);
    assert.match(page, /from "\.\/AgendaMoneyLine"/);
    assert.match(line, /row\.kind === "refund_pending"/);
    assert.match(line, /t\("Refund"\)/);
    assert.match(page, /Refund it here/);
    assert.doesNotMatch(page, /MoneyRefundSheet/);
    assert.doesNotMatch(page, /Issue refund/);
    assert.doesNotMatch(line, /MoneyRefundSheet/);
  });

  it("refundOwnBookingPayment owns the booking then executeBookingRefund", () => {
    const src = read("lib/talent-agenda/refund-actions.ts");
    assert.match(src, /requireOwnBooking/);
    assert.match(src, /executeBookingRefund/);
    assert.match(src, /reason:\s*"booking_cancelled"/);
    assert.match(src, /export async function refundOwnBookingPayment/);
  });

  it("talent-agenda barrel exports the Money refund writer", () => {
    const barrel = read("lib/talent-agenda/index.ts");
    assert.match(barrel, /refundOwnBookingPayment/);
  });
});
