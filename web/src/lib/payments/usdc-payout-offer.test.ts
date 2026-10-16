import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { usdcPayoutOffer } from "./usdc-payout-offer";
import { setUsdcPayoutsOverride } from "./payout-countries";

describe("usdcPayoutOffer switch OFF (default)", () => {
  it("offers nothing anywhere", () => {
    setUsdcPayoutsOverride(null);
    for (const c of ["AR", "MX", "US", "CO"]) {
      assert.deepEqual(usdcPayoutOffer(c), { eligible: false, recommended: false }, c);
    }
  });
});

describe("usdcPayoutOffer", () => {
  before(() => setUsdcPayoutsOverride(true));
  after(() => setUsdcPayoutsOverride(null));
  it("Argentina is eligible and recommended", () => {
    assert.deepEqual(usdcPayoutOffer("AR"), { eligible: true, recommended: true });
    assert.deepEqual(usdcPayoutOffer(" ar "), { eligible: true, recommended: true });
  });
  for (const c of ["MX", "CO", "CL", "PE", "UY", "CR", "PA", "DO", "EC", "PY", "SV", "CA", "US"]) {
    it(`${c} is eligible with equal weight`, () => {
      assert.deepEqual(usdcPayoutOffer(c), { eligible: true, recommended: false });
    });
  }
  for (const c of ["GT", "BR", "VE", "NI", "", null, undefined]) {
    it(`${String(c)} is not offered USDC`, () => {
      assert.deepEqual(usdcPayoutOffer(c), { eligible: false, recommended: false });
    });
  }
});
