import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { payoutArrival, talentPayoutBreakdown } from "./talent-payout-breakdown";

describe("talentPayoutBreakdown", () => {
  it("gross - commission - other = net, to the cent", () => {
    for (const [g, n, c] of [
      [100_000, 100_000, 0],
      [100_000, 80_000, 0],
      [123_457, 98_765, 1_234],
    ] as const) {
      const b = talentPayoutBreakdown({ grossCents: g, netCents: n, tulalaCommissionCents: c });
      assert.ok(b);
      assert.equal(b.grossCents - b.tulalaCommissionCents - b.otherDeductionsCents, b.netCents);
    }
  });
  it("returns null instead of guessing when net exceeds gross or inputs are not whole cents", () => {
    assert.equal(talentPayoutBreakdown({ grossCents: 100, netCents: 101 }), null);
    assert.equal(talentPayoutBreakdown({ grossCents: 100.5, netCents: 90 }), null);
  });
});

describe("payoutArrival", () => {
  it("documented business days by payout country: US 2, MX 3, CA 3", () => {
    assert.equal(payoutArrival({ currency: "USD", payoutCountry: "US" }).businessDays, 2);
    assert.equal(payoutArrival({ currency: "MXN", payoutCountry: "mx" }).businessDays, 3);
    assert.equal(payoutArrival({ currency: "USD", payoutCountry: "CA" }).businessDays, 3);
    assert.equal(payoutArrival({ currency: "USD", payoutCountry: "CA" }).countryKnown, true);
  });
  it("unknown or undocumented country states no number", () => {
    for (const c of [null, undefined, "", "BR"]) {
      const a = payoutArrival({ currency: "MXN", payoutCountry: c });
      assert.equal(a.businessDays, null);
      assert.equal(a.countryKnown, false);
    }
  });
  it("first payout window is Stripe's documented 7 to 14 days", () => {
    const a = payoutArrival({ currency: "USD", payoutCountry: "US" });
    assert.deepEqual([a.firstPayoutMinDays, a.firstPayoutMaxDays], [7, 14]);
  });
});
