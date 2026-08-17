import { strict as assert } from "node:assert";
import { test } from "node:test";
import { stripeConnectLocale } from "./connect-locale";

test("bare Spanish maps to LATIN AMERICAN Spanish, not European", () => {
  // The recipient roster is Mexican/Argentine/Chilean/Colombian. Shipping
  // es-ES would put Iberian phrasing in front of every LatAm talent.
  assert.equal(stripeConnectLocale("es"), "es-419");
});

test("an explicit regional tag is preserved", () => {
  assert.equal(stripeConnectLocale("es-MX"), "es-MX");
  assert.equal(stripeConnectLocale("es_ar"), "es-AR");
  assert.equal(stripeConnectLocale("pt-BR"), "pt-BR");
});

test("English and other supported bases pass through", () => {
  assert.equal(stripeConnectLocale("en"), "en");
  assert.equal(stripeConnectLocale("fr"), "fr");
});

test("unknown or empty locales defer to Stripe rather than guessing", () => {
  for (const v of ["", "   ", null, undefined, "klingon", "xx-YY"]) {
    assert.equal(stripeConnectLocale(v), undefined, `expected undefined for ${JSON.stringify(v)}`);
  }
});

test("case and separator variations normalize", () => {
  assert.equal(stripeConnectLocale("ES"), "es-419");
  assert.equal(stripeConnectLocale("  es-mx  "), "es-MX");
});
