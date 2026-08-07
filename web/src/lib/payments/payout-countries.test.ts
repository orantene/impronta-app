// Pins the LatAm payout-country contract (bug found live 2026-08-09: a Mexican
// talent's Payouts page said "Payouts aren't available in Mexico yet" while the
// API happily created a Mexican recipient account). Country support below was
// verified against the live Stripe API — every ISO-2 in the recipient set
// created a real Express account with the `transfers` capability.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONNECT_FULL_SERVICE_COUNTRIES,
  CONNECT_RECIPIENT_ONLY_COUNTRIES,
  isConnectPayoutCountry,
  requiresRecipientAgreement,
  normalizePayoutCountry,
  PAYOUT_COUNTRIES,
} from "./payout-countries";

describe("LatAm payout countries", () => {
  it("Connect can open accounts across the LatAm expansion map", () => {
    for (const iso2 of ["MX", "AR", "CL", "CO", "PE", "UY", "PY", "EC", "CR", "PA", "GT", "SV", "DO"]) {
      assert.equal(isConnectPayoutCountry(iso2), true, `${iso2} must be payout-capable`);
    }
  });

  it("recipient-only countries require the recipient service agreement", () => {
    // Stripe hard-errors without it, so this flag drives accounts.create.
    for (const iso2 of ["MX", "AR", "CL", "CO", "PE", "UY"]) {
      assert.equal(requiresRecipientAgreement(iso2), true, `${iso2} needs the recipient agreement`);
    }
  });

  it("full-service countries must NOT send the recipient agreement", () => {
    for (const iso2 of ["US", "GB", "CA", "ES", "FR", "DE"]) {
      assert.equal(requiresRecipientAgreement(iso2), false, `${iso2} is full-service`);
      assert.equal(isConnectPayoutCountry(iso2), true);
    }
  });

  it("Brazil is excluded everywhere (Stripe rejects BR for US platforms)", () => {
    assert.equal(isConnectPayoutCountry("BR"), false);
    assert.equal(requiresRecipientAgreement("BR"), false);
    assert.equal(
      PAYOUT_COUNTRIES.some((c) => c.iso2 === "BR"),
      false,
      "BR must not be offered in the country picker",
    );
  });

  it("the two sets are disjoint (a country is full-service OR recipient-only)", () => {
    for (const iso2 of CONNECT_RECIPIENT_ONLY_COUNTRIES) {
      assert.equal(CONNECT_FULL_SERVICE_COUNTRIES.has(iso2), false, `${iso2} in both sets`);
    }
  });

  it("every country offered in the picker is actually payout-capable", () => {
    for (const c of PAYOUT_COUNTRIES) {
      assert.equal(isConnectPayoutCountry(c.iso2), true, `picker offers ${c.iso2} but Connect can't use it`);
      assert.equal(normalizePayoutCountry(c.iso2), c.iso2);
    }
  });

  it("normalizes case and rejects unknown codes", () => {
    assert.equal(normalizePayoutCountry("mx"), "MX");
    assert.equal(normalizePayoutCountry(" ar "), "AR");
    assert.equal(normalizePayoutCountry("ZZ"), null);
    assert.equal(normalizePayoutCountry(null), null);
  });
});
