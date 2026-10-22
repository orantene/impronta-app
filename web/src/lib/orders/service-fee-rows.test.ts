import { test } from "node:test";
import assert from "node:assert/strict";
import { chargedGrossCents, serviceFeeRows } from "./service-fee-rows";

const fmt = (c: number) => `USD ${(c / 100).toFixed(2)}`;

test("TUL-1920: 2500 price, 2538 charged shows Subtotal / fee +0.38 / Total (en + es)", () => {
  const en = serviceFeeRows({ subtotalCents: 2500, chargedCents: 2538 }, false, fmt);
  assert.deepEqual(en, { subtotal: "USD 25.00", feeLabel: "Tulala service fee", fee: "+USD 0.38", totalLabel: "Total", total: "USD 25.38" });
  const es = serviceFeeRows({ subtotalCents: 2500, chargedCents: 2538 }, true, fmt);
  assert.equal(es?.feeLabel, "Cargo por servicio de Tulala");
});

test("TUL-1920: no fee on top, or no price, renders no extra rows", () => {
  assert.equal(serviceFeeRows({ subtotalCents: 2500, chargedCents: 2500 }, false, fmt), null);
  assert.equal(serviceFeeRows({ subtotalCents: 0, chargedCents: 0 }, false, fmt), null);
  assert.equal(serviceFeeRows({ subtotalCents: 2500, chargedCents: 2400 }, false, fmt), null);
});

test("TUL-1920: receipt charged total sums paid non-refund transactions only", () => {
  assert.equal(chargedGrossCents([{ status: "paid", gross_amount_cents: 2538 }]), 2538);
  assert.equal(
    chargedGrossCents([
      { status: "paid", gross_amount_cents: 2538 },
      { status: "paid", gross_amount_cents: 2538, refund_of_transaction_id: "x" },
      { status: "failed", gross_amount_cents: 999 },
    ]),
    2538,
  );
  assert.equal(chargedGrossCents([{ status: "pending", gross_amount_cents: 2538 }]), null);
});
