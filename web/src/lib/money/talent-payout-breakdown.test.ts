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
  it("MX platform 3 business days, US 2, recipient adds 24h", () => {
    assert.deepEqual(payoutArrival({ currency: "MXN" }), { platform: "mx", businessDays: 3, recipientExtraHours: null });
    assert.deepEqual(payoutArrival({ currency: "usd" }), { platform: "us", businessDays: 2, recipientExtraHours: null });
    assert.equal(payoutArrival({ currency: "MXN", recipientAccount: true }).recipientExtraHours, 24);
  });
});
