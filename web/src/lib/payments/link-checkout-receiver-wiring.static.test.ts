import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** The money row a payment link opens carries the resolved receiver; the link read selects inquiry_id. */
const src = readFileSync(join(process.cwd(), "src/lib/payments/link-checkout.ts"), "utf8");

test("openPaymentLinkCheckout resolves the receiver and writes the three payout_receiver_* columns", () => {
  assert.match(src, /resolveLinkPayoutReceiver/);
  assert.match(src, /link\.inquiry_id/);
  for (const col of ["payout_receiver_id", "payout_receiver_kind", "payout_receiver_display_name"]) {
    assert.ok(src.includes(col), col);
  }
});

test("the payment_links read selects inquiry_id", () => {
  assert.match(src, /\.select\("id, tenant_id, order_id, code, amount_cents, currency, provider, status, expires_at, reservation_id, inquiry_id"\)/);
});

test("no tenant-default read in the resolver", () => {
  const r = readFileSync(join(process.cwd(), "src/lib/payments/link-payout-receiver.ts"), "utf8");
  assert.doesNotMatch(r, /from\("agencies"\)|default_currency/);
});
