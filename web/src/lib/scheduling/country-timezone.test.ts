import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOURS_NUDGE_COPY, showHoursSetupNudge } from "./hours-setup-nudge";
import { timezoneFromCountry } from "./country-timezone";
import { resolveEssentialsTimezone } from "../onboarding/essentials-resolve";
import { isValidIanaTimeZone } from "./tz";

describe("timezoneFromCountry (TUL-634)", () => {
  it("maps single-zone countries by name and ISO code", () => {
    assert.equal(timezoneFromCountry("CO"), "America/Bogota");
    assert.equal(timezoneFromCountry("Colombia"), "America/Bogota");
    assert.equal(timezoneFromCountry("AR"), "America/Argentina/Buenos_Aires");
    assert.equal(timezoneFromCountry("España"), "Europe/Madrid");
    assert.equal(timezoneFromCountry("ES"), "Europe/Madrid");
    assert.equal(timezoneFromCountry("CH"), "Europe/Zurich");
    assert.equal(timezoneFromCountry("Suiza"), "Europe/Zurich");
    assert.equal(timezoneFromCountry("GB"), "Europe/London");
    assert.equal(timezoneFromCountry("UK"), "Europe/London");
    assert.equal(timezoneFromCountry("MX"), "America/Mexico_City");
  });
  it("returns null for multi-zone or unknown countries", () => {
    for (const c of ["US", "United States", "CA", "BR", "AU", "", "  ", null, undefined, "Narnia"]) {
      assert.equal(timezoneFromCountry(c), null);
    }
  });
  it("every mapped zone is a valid IANA zone", () => {
    for (const c of ["CO", "AR", "ES", "CH", "GB", "MX"]) {
      assert.ok(isValidIanaTimeZone(timezoneFromCountry(c)!));
    }
  });
});

describe("resolveEssentialsTimezone with a bare country (TUL-634)", () => {
  it("falls back to the country zone when no timezone or city is known", () => {
    assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: "CO" }), "America/Bogota");
    assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: "GB" }), "Europe/London");
  });
  it("keeps the confirmed zone and the city zone ahead of the country", () => {
    assert.equal(resolveEssentialsTimezone({ timezone: "America/Lima", city: null, country: "CO" }), "America/Lima");
    assert.equal(resolveEssentialsTimezone({ timezone: null, city: "Cancún, Quintana Roo", country: "Mexico" }), "America/Cancun");
  });
  it("stays null for an ambiguous country so the dashboard nudge takes over", () => {
    assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: "Narnia" }), null);
    assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: null }), null);
  });
});

describe("showHoursSetupNudge (TUL-634)", () => {
  it("shows while availability is unfinished and hides once it is done", () => {
    assert.equal(showHoursSetupNudge(["photo", "services"]), true);
    assert.equal(showHoursSetupNudge(["photo", "availability"]), false);
  });
  it("has ES and EN copy without em dashes", () => {
    for (const v of Object.values(HOURS_NUDGE_COPY)) assert.ok(v.length > 10 && !v.includes("—"));
  });
});
