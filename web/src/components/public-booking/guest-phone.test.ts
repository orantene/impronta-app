import assert from "node:assert/strict";
import { test } from "node:test";

import { guestCountryOptions, guestDefaultPhoneIso, joinGuestPhone, sanitizeGuestPhone, splitGuestPhone } from "./guest-phone";

test("TUL-897: letters and symbols never reach the phone value", () => {
  assert.equal(sanitizeGuestPhone("55 abc 1234-5678"), "55 1234 5678");
  assert.equal(sanitizeGuestPhone("+52 (55) 1234"), "+52 55 1234");
  assert.equal(sanitizeGuestPhone("hola"), "");
  assert.equal(sanitizeGuestPhone("52+55+"), "5255", "a plus only counts in front");
  assert.equal(sanitizeGuestPhone("  +1  555"), "+1 555");
});

test("TUL-923: the default country comes from the guest's browser, then the talent, never a fixed +1", () => {
  assert.equal(guestDefaultPhoneIso({ languages: ["es-MX", "en-US"], locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["es"], fallbackCountry: "MX", locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["es"], locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: [], locale: "en" }), "US");
  // TUL-923 recurrence: an en-US browser must not beat the talent's own country or a Mexican time zone.
  assert.equal(guestDefaultPhoneIso({ languages: ["en-US", "en"], fallbackCountry: "MX", locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["en-US"], timeZone: "America/Cancun", locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["en-US"], timeZone: "America/New_York", locale: "en" }), "US");
  assert.equal(guestDefaultPhoneIso({ languages: ["en-US"], fallbackCountry: "MX", timeZone: "America/New_York", locale: "en" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["es-419"], fallbackCountry: "CO", locale: "es" }), "CO", "a numeric region is not a country");
});

test("TUL-1056: a Cancun (MX) site defaults to +52, not the browser's unrelated +44 (en-GB)", () => {
  // The site's own country now wins over ANY browser-declared region, not
  // just US: a guest whose browser/OS reports en-GB (a common, meaningless
  // default) must still see the talent's own MX default, not GB.
  assert.equal(guestDefaultPhoneIso({ languages: ["en-GB"], fallbackCountry: "MX", locale: "en" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["en-GB"], fallbackCountry: "MX", locale: "es" }), "MX");
  // No site country known: the browser's own region still wins (unchanged).
  assert.equal(guestDefaultPhoneIso({ languages: ["en-GB"], locale: "en" }), "GB");
});

test("TUL-923: the stored value is dial + national and splits back", () => {
  assert.equal(joinGuestPhone("MX", "55 1234 5678"), "+52 55 1234 5678");
  assert.equal(joinGuestPhone("MX", ""), "");
  assert.equal(joinGuestPhone("MX", "+44 7700"), "+44 7700", "a typed + number wins");
  assert.deepEqual(splitGuestPhone("+52 55 1234 5678", "US"), { iso: "MX", national: "55 1234 5678" });
  assert.deepEqual(splitGuestPhone("+1 416 555 0100", "CA"), { iso: "CA", national: "416 555 0100" });
  assert.deepEqual(splitGuestPhone("5512345678", "MX"), { iso: "MX", national: "5512345678" });
});

test("TUL-929: country names follow the site language", () => {
  const es = guestCountryOptions("es");
  assert.equal(es.find((o) => o.iso === "MX")?.label, "México");
  assert.equal(es.find((o) => o.iso === "US")?.label, "Estados Unidos");
  assert.equal(es.find((o) => o.iso === "DE")?.label, "Alemania");
  assert.equal(guestCountryOptions("en").find((o) => o.iso === "DE")?.label, "Germany");
  assert.equal(es[0]?.iso, "MX", "popular markets lead");
});

test("TUL-844: typing the first digit keeps it, in every country, one keystroke at a time", () => {
  for (const iso of ["MX", "US", "ES", "AR", "GB"]) {
    let value = "";
    for (const ch of "5512345678") {
      const national = splitGuestPhone(value, iso).national;
      value = joinGuestPhone(iso, sanitizeGuestPhone(national + ch));
      assert.equal(splitGuestPhone(value, iso).national.replace(/\s/g, "").slice(0, 1), "5", `${iso}: first digit survives`);
    }
    assert.equal(splitGuestPhone(value, iso).national.replace(/\s/g, ""), "5512345678", `${iso}: full number round-trips`);
  }
});
