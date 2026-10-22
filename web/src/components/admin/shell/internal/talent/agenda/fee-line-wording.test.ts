import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { translateDashboardText } from "../../dashboard-i18n";
import { agreedLines } from "./view-model";

// TUL-1906: a service fee added on top must never read as "included" in the total.
const base = {
  lines: [{ label: "Cut", cents: 30000 }],
  payment: "paid",
  title: "Cut",
  client: { name: "A" },
  kind: "booking",
};
const withFee = { ...base, money: { totalCents: 30000, paidCents: 30450, dueCents: 0, currency: "MXN" } } as never;
const noFee = { ...base, money: { totalCents: 30000, paidCents: 30000, dueCents: 0, currency: "MXN" } } as never;

describe("agreedLines fee wording (TUL-1906)", () => {
  it("shows Subtotal, then +fee, then Total paid, in that order", () => {
    const lines = agreedLines(withFee);
    const rows = lines.filter((l) => ["total", "service-fee", "paid"].includes(l.id));
    assert.deepEqual(rows.map((l) => l.id), ["total", "service-fee", "paid"]);
    assert.deepEqual(rows.map((l) => l.label), ["Subtotal", "Tulala service fee", "Total paid"]);
    assert.match(rows[0].value, /300/);
    assert.match(rows[1].value, /^\+.*4\.50/);
    assert.match(rows[2].value, /304\.50/);
    assert.ok(!lines.some((l) => /includes/i.test(l.label)));
  });
  it("spanish labels never say Incluye", () => {
    const labels = agreedLines(withFee).map((l) => translateDashboardText(l.label, "es"));
    assert.ok(labels.includes("Subtotal"));
    assert.ok(labels.includes("Cargo por servicio de Tulala"));
    assert.ok(labels.includes("Total pagado"));
    assert.ok(!labels.some((l) => /incluye/i.test(l)));
  });
  it("without a fee the card is unchanged: Total then Paid", () => {
    const lines = agreedLines(noFee);
    assert.deepEqual(lines.filter((l) => ["total", "paid"].includes(l.id)).map((l) => l.label), ["Total", "Paid"]);
    assert.ok(!lines.some((l) => l.id === "service-fee"));
  });
});
