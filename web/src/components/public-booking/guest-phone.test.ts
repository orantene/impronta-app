import assert from "node:assert/strict";
import { test } from "node:test";

import { guestDefaultPhoneIso, joinGuestPhone, sanitizeGuestPhone, splitGuestPhone } from "./guest-phone";

test("TUL-897: letters and symbols never reach the phone value", () => {
  assert.equal(sanitizeGuestPhone("55 abc 1234-5678"), "55 1234 5678");
  assert.equal(sanitizeGuestPhone("+52 (55) 1234"), "+52 55 1234");
  assert.equal(sanitizeGuestPhone("hola"), "");
  assert.equal(sanitizeGuestPhone("52+55+"), "5255", "a plus only counts in front");
  assert.equal(sanitizeGuestPhone("  +1  555"), "+1 555");
});

test("TUL-923: the default country comes from the guest's browser, then the talent, never a fixed +1", () => {
  assert.equal(guestDefaultPhoneIso({ languages: ["es-MX", "en-US"], locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["en-GB"], fallbackCountry: "MX", locale: "en" }), "GB");
  assert.equal(guestDefaultPhoneIso({ languages: ["es"], fallbackCountry: "MX", locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: ["es"], locale: "es" }), "MX");
  assert.equal(guestDefaultPhoneIso({ languages: [], locale: "en" }), "US");
  assert.equal(guestDefaultPhoneIso({ languages: ["es-419"], fallbackCountry: "CO", locale: "es" }), "CO", "a numeric region is not a country");
});

test("TUL-923: the stored value is dial + national and splits back", () => {
  assert.equal(joinGuestPhone("MX", "55 1234 5678"), "+52 55 1234 5678");
  assert.equal(joinGuestPhone("MX", ""), "");
  assert.equal(joinGuestPhone("MX", "+44 7700"), "+44 7700", "a typed + number wins");
  assert.deepEqual(splitGuestPhone("+52 55 1234 5678", "US"), { iso: "MX", national: "55 1234 5678" });
  assert.deepEqual(splitGuestPhone("+1 416 555 0100", "CA"), { iso: "CA", national: "416 555 0100" });
  assert.deepEqual(splitGuestPhone("5512345678", "MX"), { iso: "MX", national: "5512345678" });
});
