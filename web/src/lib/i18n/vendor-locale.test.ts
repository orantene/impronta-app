/**
 * Guards for the third-party locale handoff.
 *
 * The failure these pin is invisible in every screenshot an English-speaking
 * developer takes: with no explicit tag, Stripe / hCaptcha / Turnstile / Google
 * Maps all read the BROWSER language, so a Spanish-speaking client with an
 * English browser gets English widgets embedded in a Spanish page. Passing the
 * app's own resolved locale is the whole fix, and these tests pin the two ways
 * it can go wrong: sending Iberian Spanish to a Latin American audience, and
 * sending a tag the vendor rejects.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  appendQueryParamIfAbsent,
  googleMapsLocale,
  hcaptchaLocale,
  resolveVendorLocale,
  stripeBillingPortalLocale,
  stripeCheckoutLocale,
  stripeJsLocale,
  turnstileLocale,
  withGoogleMapsLanguage,
} from "./vendor-locale";

// ─── bare `es` → Latin American Spanish where the vendor has one ──────────────

test("bare Spanish maps to es-419 for every vendor that ships it", () => {
  // Our audience is Mexican/Argentine/Chilean/Colombian. Iberian phrasing in a
  // payment form is the exact regression `connect-locale.ts` was written for.
  assert.equal(stripeCheckoutLocale("es"), "es-419");
  assert.equal(stripeBillingPortalLocale("es"), "es-419");
  assert.equal(stripeJsLocale("es"), "es-419");
  assert.equal(googleMapsLocale("es"), "es-419");
});

test("bare Spanish falls back to plain es where the vendor has no LatAm variant", () => {
  // hCaptcha documents a single `es`; Turnstile only `es` / `es-es`. Sending
  // `es-419` to either would be an unknown tag, so we must degrade, not invent.
  assert.equal(hcaptchaLocale("es"), "es");
  assert.equal(turnstileLocale("es"), "es");
});

// ─── regional tags ────────────────────────────────────────────────────────────

test("a LatAm regional tag routes to the vendor's LatAm Spanish", () => {
  for (const tag of ["es-MX", "es-AR", "es-CL", "es_co"]) {
    assert.equal(stripeCheckoutLocale(tag), "es-419", `checkout ${tag}`);
    assert.equal(googleMapsLocale(tag), "es-419", `maps ${tag}`);
  }
});

test("a LatAm regional tag degrades to base es for captcha vendors", () => {
  assert.equal(hcaptchaLocale("es-MX"), "es");
  assert.equal(turnstileLocale("es-MX"), "es");
});

test("es-ES is Spain and must never be rewritten to es-419", () => {
  assert.equal(stripeCheckoutLocale("es-ES"), "es"); // Checkout's `es` IS Iberian
  assert.equal(stripeJsLocale("es-ES"), "es-ES"); // Stripe.js lists it explicitly
  assert.equal(turnstileLocale("es-ES"), "es-es"); // Turnstile lists it lowercase
  assert.equal(googleMapsLocale("es-ES"), "es"); // Maps has no es-ES; base is right
});

test("an exactly-supported regional tag is preserved verbatim", () => {
  assert.equal(stripeCheckoutLocale("pt-BR"), "pt-BR");
  assert.equal(stripeCheckoutLocale("zh-TW"), "zh-TW");
  assert.equal(stripeBillingPortalLocale("en-GB"), "en-GB");
  assert.equal(hcaptchaLocale("pt-BR"), "pt-BR");
  assert.equal(turnstileLocale("pt-BR"), "pt-br");
  assert.equal(googleMapsLocale("sr-Latn"), "sr-Latn");
});

test("an unsupported region degrades to the base language, not undefined", () => {
  // Stripe Checkout has no en-IE; the visitor should still get English.
  assert.equal(stripeCheckoutLocale("en-IE"), "en");
  assert.equal(hcaptchaLocale("fr-CA"), "fr");
  assert.equal(googleMapsLocale("de-AT"), "de");
});

test("English and other supported bases pass through unchanged", () => {
  assert.equal(stripeCheckoutLocale("en"), "en");
  assert.equal(stripeJsLocale("en"), "en");
  assert.equal(hcaptchaLocale("en"), "en");
  assert.equal(turnstileLocale("en"), "en");
  assert.equal(googleMapsLocale("en"), "en");
});

test("case and separator variations normalize", () => {
  assert.equal(stripeCheckoutLocale("ES"), "es-419");
  assert.equal(stripeCheckoutLocale("  es_mx  "), "es-419");
  assert.equal(stripeCheckoutLocale("PT-br"), "pt-BR");
  assert.equal(turnstileLocale("ZH-TW"), "zh-tw");
});

// ─── garbage in, nothing out ──────────────────────────────────────────────────

test("unknown or empty locales return undefined so the caller omits the param", () => {
  const junk = ["", "   ", null, undefined, "klingon", "xx-YY", "not a locale", "419", "-", "e"];
  for (const v of junk) {
    for (const [name, fn] of [
      ["stripeCheckout", stripeCheckoutLocale],
      ["stripeBillingPortal", stripeBillingPortalLocale],
      ["stripeJs", stripeJsLocale],
      ["hcaptcha", hcaptchaLocale],
      ["turnstile", turnstileLocale],
      ["googleMaps", googleMapsLocale],
    ] as const) {
      assert.equal(fn(v), undefined, `${name} should omit for ${JSON.stringify(v)}`);
    }
  }
});

test("the shared resolver never returns a tag outside the vendor's own set", () => {
  const table = { tags: { en: "en", es: "es" }, latamSpanish: undefined };
  assert.equal(resolveVendorLocale("es-MX", table), "es");
  assert.equal(resolveVendorLocale("ja", table), undefined);
});

// ─── URL builders ─────────────────────────────────────────────────────────────

test("hl is appended without disturbing any existing query param", () => {
  assert.equal(
    withGoogleMapsLanguage("https://maps.google.com/maps?q=Roma&output=embed&zoom=13", "es"),
    "https://maps.google.com/maps?q=Roma&output=embed&zoom=13&hl=es-419",
  );
  assert.equal(
    withGoogleMapsLanguage("https://www.google.com/maps/search/", "es"),
    "https://www.google.com/maps/search/?hl=es-419",
  );
});

test("an operator URL that already sets hl is left completely untouched", () => {
  const operatorUrl = "https://www.google.com/maps/embed?pb=!1m18!1m12&hl=fr";
  assert.equal(withGoogleMapsLanguage(operatorUrl, "es"), operatorUrl);
  // …and hl anywhere in the query counts, not just at the end.
  const first = "https://www.google.com/maps/embed?hl=de&pb=!1m18";
  assert.equal(withGoogleMapsLanguage(first, "es"), first);
});

test("a pasted embed URL's !-laden pb payload survives byte for byte", () => {
  // `new URL()` + URLSearchParams would percent-encode every `!` here. It must
  // not: this is the operator's own string from the Google Maps share dialog.
  const pb = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3024.123!2d-74.006!3d40.7128";
  assert.equal(withGoogleMapsLanguage(pb, "es"), `${pb}&hl=es-419`);
});

test("hl is never added when the locale maps to nothing Google supports", () => {
  const url = "https://maps.google.com/maps?q=Roma&output=embed";
  assert.equal(withGoogleMapsLanguage(url, "klingon"), url);
  assert.equal(withGoogleMapsLanguage(url, null), url);
  assert.equal(withGoogleMapsLanguage(url, ""), url);
});

test("appending is fragment-safe and does not double-add", () => {
  assert.equal(
    appendQueryParamIfAbsent("https://example.com/a?x=1#frag", "hl", "es-419"),
    "https://example.com/a?x=1&hl=es-419#frag",
  );
  assert.equal(
    appendQueryParamIfAbsent("https://example.com/a#frag", "hl", "es-419"),
    "https://example.com/a?hl=es-419#frag",
  );
  // A trailing bare `?` must not produce `?&hl=`.
  assert.equal(
    appendQueryParamIfAbsent("https://example.com/a?", "hl", "es-419"),
    "https://example.com/a?hl=es-419",
  );
  // A key that merely CONTAINS the name is not a match.
  assert.equal(
    appendQueryParamIfAbsent("https://example.com/a?shl=1", "hl", "es"),
    "https://example.com/a?shl=1&hl=es",
  );
  // Blank input is returned as-is rather than becoming "?hl=…".
  assert.equal(appendQueryParamIfAbsent("", "hl", "es"), "");
});
