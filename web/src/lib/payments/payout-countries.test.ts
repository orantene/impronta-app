// TUL-1052: the country set comes from Stripe's snapshot; which countries are
// live is one config list. These tests pin both.
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONNECT_FULL_SERVICE_COUNTRIES,
  CONNECT_RECIPIENT_ONLY_COUNTRIES,
  DEFAULT_LIVE_PAYOUT_COUNTRIES,
  PAYOUT_COUNTRIES,
  PAYOUT_COUNTRY_OVERRIDES,
  PICKER_PREVIEW_COUNTRIES,
  defaultPayoutCurrency,
  isKnownPayoutCountry,
  livePayoutCountries,
  normalizeKnownPayoutCountry,
  normalizePayoutCountry,
  payoutCountryComingSoonText,
  payoutCountryLabel,
  payoutCountryState,
  payoutPickerRows,
  payoutRoute,
  requiresRecipientAgreement,
  setLivePayoutCountriesOverride,
  setUsdcPayoutsOverride,
  usdcPayoutsEnabled,
  isWaitlistKey,
} from "./payout-countries";
import { requirementCodes, requirementFor } from "./stripe-connect-requirements";
import { payoutCountryRefusalCode, payoutSetupErrorText } from "./connect-account-setup";

afterEach(() => {
  setLivePayoutCountriesOverride(null);
  setUsdcPayoutsOverride(null);
});

describe("snapshot-driven set (no country added by hand)", () => {
  it("every picker, override and preview code exists in the snapshot", () => {
    const codes = new Set(requirementCodes());
    for (const c of PAYOUT_COUNTRIES) assert.ok(codes.has(c.iso2), `${c.iso2} not in snapshot`);
    for (const c of Object.keys(PAYOUT_COUNTRY_OVERRIDES)) assert.ok(codes.has(c), `override ${c} not in snapshot`);
    for (const c of PICKER_PREVIEW_COUNTRIES) assert.ok(codes.has(c), `preview ${c} not in snapshot`);
    for (const c of DEFAULT_LIVE_PAYOUT_COUNTRIES.split(",")) assert.ok(codes.has(c), `default live ${c} not in snapshot`);
  });
  it("PAYOUT_COUNTRIES is exactly the snapshot", () => {
    assert.deepEqual(PAYOUT_COUNTRIES.map((c) => c.iso2).sort(), [...requirementCodes()].sort());
  });
  it("default live countries all have a c1_* route", () => {
    for (const c of livePayoutCountries()) assert.match(payoutRoute(c), /^c1_/, c);
  });
  it("snapshot facts: 42 full-service plus US, BR standard only, Americas recipients", () => {
    assert.equal(requirementFor("FR")?.tosTypes.join(), "full");
    assert.equal(requirementFor("BR")?.dashboardTypes.join(), "full");
    for (const c of ["AR", "UY", "PE", "BO", "GY", "JM", "TT", "BS", "AG", "LC"]) assert.ok(requirementFor(c), c);
    assert.equal(requirementFor("AR")?.cardPayments, true);
    assert.equal(requirementFor("CL")?.cardPayments, false);
    assert.equal(requirementFor("NI"), null);
  });
});

describe("live list switch", () => {
  it("defaults to US, MX, CA (UY is coming soon until Stripe allows US->UY payouts)", () => {
    assert.deepEqual([...livePayoutCountries()].sort(), ["CA", "MX", "US"]);
  });
  it("each live country is selectable and creatable", () => {
    for (const c of ["US", "MX", "CA"]) {
      assert.equal(payoutCountryState(c), "selectable", c);
      assert.equal(normalizePayoutCountry(c.toLowerCase()), c);
      assert.equal(payoutCountryRefusalCode(c), null);
    }
  });
  it("every other country is coming soon and refused", () => {
    for (const c of ["FR", "GB", "AR", "CL", "CO", "PE", "BO", "JM", "AU", "ES", "UY"]) {
      assert.equal(payoutCountryState(c), "coming_soon", c);
      assert.equal(normalizePayoutCountry(c), null, c);
      assert.equal(payoutCountryRefusalCode(c), `payout_setup:coming_soon:${c}`, c);
    }
  });
  it("adding a code to the list makes it live with no code change", () => {
    setLivePayoutCountriesOverride(["US", "AR", "fr"]);
    assert.equal(payoutCountryState("AR"), "selectable");
    assert.equal(payoutCountryState("FR"), "selectable");
    assert.equal(payoutCountryState("MX"), "coming_soon");
    assert.equal(requiresRecipientAgreement("AR"), true);
    assert.equal(requiresRecipientAgreement("FR"), false);
  });
  it("BR is always a coming-soon row; if listed, Stripe's refusal is the clear unavailable error", () => {
    assert.ok(payoutPickerRows("en").comingSoon.some((c) => c.iso2 === "BR"));
    assert.equal(payoutRoute("BR"), "unavailable");
    setLivePayoutCountriesOverride(["US", "BR"]);
    assert.equal(payoutCountryState("BR"), "unavailable");
    assert.equal(normalizePayoutCountry("BR"), null);
    assert.equal(payoutCountryRefusalCode("BR"), "payout_setup:country_unavailable:BR:connect");
    assert.ok(payoutPickerRows("en").comingSoon.some((c) => c.iso2 === "BR"));
    assert.ok(!payoutPickerRows("en").selectable.some((c) => c.iso2 === "BR"));
  });
  it("unknown codes are not refused as coming soon", () => {
    assert.equal(payoutCountryRefusalCode("ZZ"), null);
    assert.equal(payoutCountryRefusalCode(null), null);
  });
});

describe("picker rows", () => {
  it("lists the live countries first (MX, US) and every Americas recipient country as coming soon", () => {
    const { selectable, comingSoon } = payoutPickerRows("en");
    assert.deepEqual(selectable.map((c) => c.iso2).slice(0, 2), ["MX", "US"]);
    assert.deepEqual(selectable.map((c) => c.iso2).sort(), ["CA", "MX", "US"]);
    const soon = new Set(comingSoon.map((c) => c.iso2));
    for (const c of "UY AR CL CO PE EC PY BO GY CR PA GT SV DO JM TT BS AG LC BR ES PT GB FR DE IT NL AU".split(" ")) {
      assert.ok(soon.has(c), `${c} missing from coming soon`);
    }
  });
  it("names come from Intl in ES and EN, flags from the code", () => {
    assert.equal(payoutPickerRows("es").selectable.find((c) => c.iso2 === "MX")?.label, "México");
    assert.equal(payoutPickerRows("en").selectable.find((c) => c.iso2 === "MX")?.label, "Mexico");
    assert.equal(payoutPickerRows("en").selectable.find((c) => c.iso2 === "US")?.flag, String.fromCodePoint(0x1f1fa, 0x1f1f8));
  });
});

describe("routing, agreement, currency", () => {
  it("routes per country", () => {
    assert.equal(payoutRoute("US"), "c1_us_platform");
    assert.equal(payoutRoute("MX"), "c1_mx_platform");
    assert.equal(payoutRoute("CA"), "c1_us_platform");
    assert.equal(payoutRoute("UY"), "c1_us_platform");
    assert.equal(payoutRoute("FR"), "c1_us_platform");
    assert.equal(payoutRoute("AR"), "c2_recipient_us");
    assert.equal(payoutRoute("PE"), "c2_recipient_us");
    assert.equal(payoutRoute("BR"), "unavailable");
    assert.equal(payoutRoute("NI"), "unavailable");
  });
  it("MX keeps today's recipient agreement on the US platform; UY and CA are full accounts", () => {
    assert.equal(requiresRecipientAgreement("MX"), true);
    assert.equal(requiresRecipientAgreement("UY"), false);
    assert.equal(requiresRecipientAgreement("CA"), false);
    assert.equal(requiresRecipientAgreement("US"), false);
    assert.equal(requiresRecipientAgreement("AR"), true);
  });
  it("Connect sets derive from routes", () => {
    assert.ok(CONNECT_FULL_SERVICE_COUNTRIES.has("US") && CONNECT_FULL_SERVICE_COUNTRIES.has("CA"));
    assert.ok(CONNECT_RECIPIENT_ONLY_COUNTRIES.has("AR") && !CONNECT_RECIPIENT_ONLY_COUNTRIES.has("MX"));
  });
  it("payout currency", () => {
    assert.equal(defaultPayoutCurrency("CA"), "cad");
    assert.equal(defaultPayoutCurrency("MX"), "mxn");
    assert.equal(defaultPayoutCurrency("UY"), "uyu");
    assert.equal(defaultPayoutCurrency("FR"), "eur");
    assert.equal(defaultPayoutCurrency("US"), "usd");
    assert.equal(defaultPayoutCurrency(null), "usd");
  });
});

describe("display of existing accounts and copy", () => {
  it("an existing AR talent still resolves and labels in ES and EN", () => {
    assert.equal(isKnownPayoutCountry("ar"), true);
    assert.equal(normalizeKnownPayoutCountry(" ar "), "AR");
    assert.equal(normalizePayoutCountry("AR"), null);
    assert.match(payoutCountryLabel("AR", "es"), /Argentina/);
    assert.match(payoutCountryLabel("FR", "es"), /Francia/);
    assert.match(payoutCountryLabel("FR", "en"), /France/);
    assert.equal(payoutCountryLabel("ZZ"), "ZZ");
  });
  it("coming-soon errors read in ES and EN without em dashes", () => {
    const es = payoutSetupErrorText("payout_setup:coming_soon:FR", true);
    const en = payoutSetupErrorText("payout_setup:coming_soon:FR", false);
    assert.equal(es, "Los pagos en Francia llegan pronto");
    assert.equal(en, "Payouts in France are coming soon");
    assert.equal(payoutCountryComingSoonText("AR", "es"), "Los pagos en Argentina llegan pronto");
    for (const s of [es, en]) assert.doesNotMatch(s, /—/);
  });
  it("waitlist keys: snapshot countries and USDC only", () => {
    assert.equal(isWaitlistKey("AR"), true);
    assert.equal(isWaitlistKey("usdc"), true);
    assert.equal(isWaitlistKey("NI"), false);
  });
});

describe("USDC switch", () => {
  it("defaults OFF and honors the test override", () => {
    assert.equal(usdcPayoutsEnabled(), false);
    setUsdcPayoutsOverride(true);
    assert.equal(usdcPayoutsEnabled(), true);
  });
});

describe("UY switch (Oran 2026-10-14)", () => {
  it("UY is coming soon by default and goes live with no code change when added to the list", () => {
    assert.equal(payoutCountryState("UY"), "coming_soon");
    assert.notEqual(payoutCountryRefusalCode("UY"), null);
    const prev = process.env.NEXT_PUBLIC_PAYOUT_COUNTRIES_LIVE;
    try {
      process.env.NEXT_PUBLIC_PAYOUT_COUNTRIES_LIVE = "US,MX,CA,UY";
      assert.equal(payoutCountryState("UY"), "selectable");
      assert.equal(payoutCountryRefusalCode("UY"), null);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_PAYOUT_COUNTRIES_LIVE;
      else process.env.NEXT_PUBLIC_PAYOUT_COUNTRIES_LIVE = prev;
    }
  });
});
