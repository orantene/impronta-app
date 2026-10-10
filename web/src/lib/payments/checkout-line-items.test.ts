import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkoutLineItems } from "./stripe-checkout";

const sum = (l: ReturnType<typeof checkoutLineItems>) => l.reduce((n, i) => n + (i.price_data?.unit_amount ?? 0), 0);

describe("checkoutLineItems", () => {
  it("one line when there is no fee", () => {
    const l = checkoutLineItems({ amountCents: 10000, currency: "MXN", description: "Cut" });
    assert.equal(l.length, 1);
    assert.equal(sum(l), 10000);
  });
  it("splits the fee into its own line and still totals the collect", () => {
    const l = checkoutLineItems({ amountCents: 10150, serviceFeeCents: 150, currency: "MXN", description: "Cut", locale: "es" });
    assert.equal(l.length, 2);
    assert.equal(l[0].price_data?.unit_amount, 10000);
    assert.equal(l[1].price_data?.unit_amount, 150);
    assert.equal(l[1].price_data?.product_data?.name, "Cargo por servicio");
    assert.equal(sum(l), 10150);
  });
  it("never splits into a zero or negative principal", () => {
    assert.equal(checkoutLineItems({ amountCents: 150, serviceFeeCents: 150, currency: "MXN" }).length, 1);
  });
});

describe("wiring", () => {
  it("the link checkout passes collect minus principal as the fee line", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./link-checkout.ts", import.meta.url), "utf8");
    assert.match(src, /serviceFeeCents: Math\.max\(0, collectCents - amountCents\)/);
  });
});
