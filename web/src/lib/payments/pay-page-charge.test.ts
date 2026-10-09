import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { chargedFields } from "@/lib/messaging/payment-card-sync";
import { chargeFeeLines, chargedTotalCents } from "./pay-page-charge";

test("principal + fee = charge: MX$1,000 + 1.5% shows the 1,015 the card is charged", () => {
  const lines = chargeFeeLines({ principalCents: 100_000, chargeCents: 101_500 });
  assert.deepEqual(lines, [
    { code: "service_subtotal", cents: 100_000 },
    { code: "platform_fee", cents: 1_500 },
    { code: "total_charged", cents: 101_500 },
  ]);
  assert.equal(chargedTotalCents(lines), 101_500);
});

test("no fee on top means no breakdown (never a guess), and a charge below the price is never shown as a fee", () => {
  assert.deepEqual(chargeFeeLines({ principalCents: 100_000, chargeCents: 100_000 }), []);
  assert.deepEqual(chargeFeeLines({ principalCents: 100_000, chargeCents: 90_000 }), []);
  assert.deepEqual(chargeFeeLines({ principalCents: 0, chargeCents: 1_500 }), []);
  assert.equal(chargedTotalCents([]), null);
  assert.equal(chargedTotalCents(undefined), null);
});

test("the paid card is stamped with the charge only when it is more than the price", () => {
  assert.deepEqual(chargedFields(100_000, 101_500), { chargedCents: 101_500 });
  assert.deepEqual(chargedFields(100_000, 100_000), {});
  assert.deepEqual(chargedFields(100_000, null), {});
  assert.deepEqual(chargedFields(null, 101_500), {});
});

test("the pay page wires the preview (open) and the paid charge (paid), and the view shows the charged total", () => {
  const page = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/pay-page.tsx"), "utf8");
  assert.match(page, /loadPreviewChargeLines\(admin,/);
  assert.match(page, /loadPaidChargeLines\(admin, loaded\.orderId\)/);
  assert.match(page, /feeLines=\{paidFeeLines\}/);
  const view = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/CheckoutView.tsx"), "utf8");
  assert.match(view, /find\(\(l\) => l\.code === "total_charged"\)\?\.cents \?\? props\.amountCents/);
  assert.match(view, /data-pay-fee-note/);
  const loader = readFileSync(join(process.cwd(), "src/lib/payments/pay-page-charge.ts"), "utf8");
  assert.match(loader, /collectForOrderPrincipal\(/, "the preview reads the same collect the checkout charges");
});
