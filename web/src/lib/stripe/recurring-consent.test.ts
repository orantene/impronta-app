import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { recurringConsentParams } from "./recurring-consent";

const ORIGIN = "https://tulala.digital";

test("requires terms acceptance on the Checkout page", () => {
  const p = recurringConsentParams({ locale: "en", interval: "month", marketingOrigin: ORIGIN });
  assert.deepEqual(p.consent_collection, { terms_of_service: "required" });
});

test("English monthly: renewal, cancel in Settings, access kept, Terms link", () => {
  const p = recurringConsentParams({ locale: "en", interval: "month", marketingOrigin: ORIGIN });
  const msg = p.custom_text.terms_of_service_acceptance.message;
  assert.match(msg, /every month/);
  assert.match(msg, /until I cancel/);
  assert.match(msg, /Settings/);
  assert.match(msg, /end of the period I paid for/);
  assert.ok(msg.includes("[Terms](https://tulala.digital/legal/terms)"));
  assert.match(p.custom_text.submit.message, /every month/);
});

test("Spanish yearly uses es copy and the es-prefixed Terms page", () => {
  const p = recurringConsentParams({ locale: "es", interval: "year", marketingOrigin: ORIGIN });
  const msg = p.custom_text.terms_of_service_acceptance.message;
  assert.match(msg, /cada año/);
  assert.match(msg, /hasta que cancele/);
  assert.ok(msg.includes("[Términos](https://tulala.digital/es/legal/terms)"));
  assert.match(p.custom_text.submit.message, /cada año/);
});

test("unknown locale falls back to English; within Stripe's 1200 char limit; no em dashes", () => {
  for (const locale of ["en", "es", "fr", null, undefined]) {
    for (const interval of ["month", "year"] as const) {
      const p = recurringConsentParams({ locale, interval, marketingOrigin: ORIGIN });
      for (const m of [p.custom_text.terms_of_service_acceptance.message, p.custom_text.submit.message]) {
        assert.ok(m.length <= 1200);
        assert.ok(!m.includes("—"));
      }
    }
  }
  const fr = recurringConsentParams({ locale: "fr", interval: "month", marketingOrigin: ORIGIN });
  assert.match(fr.custom_text.submit.message, /every month/);
});

for (const file of ["talent-billing.ts", "workspace-billing.ts"]) {
  test(`${file} spreads recurringConsentParams with locale + interval into the session`, () => {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(src, /\.\.\.recurringConsentParams\(\{[^}]*locale: opts\.locale[^}]*interval: price\.interval/);
  });
}

test("trial EN: not charged today, charged after N days, cancel before trial ends", () => {
  const p = recurringConsentParams({ locale: "en", interval: "month", marketingOrigin: ORIGIN, trialDays: 14 });
  const msg = p.custom_text.terms_of_service_acceptance.message;
  assert.match(msg, /not be charged today/);
  assert.match(msg, /14-day free trial/);
  assert.match(msg, /every month until I cancel/);
  assert.match(msg, /before the trial ends/);
  assert.match(msg, /keep access until the trial ends/);
  assert.doesNotMatch(msg, /period I paid for/);
  assert.doesNotMatch(msg, /charge my card the price shown now/);
  assert.match(p.custom_text.submit.message, /Free for 14 days/);
});

test("trial ES yearly: no cargo hoy, cargo tras N dias, cancelar antes de que termine", () => {
  const p = recurringConsentParams({ locale: "es", interval: "year", marketingOrigin: ORIGIN, trialDays: 7 });
  const msg = p.custom_text.terms_of_service_acceptance.message;
  assert.match(msg, /no se me cobrará hoy/);
  assert.match(msg, /7 días de prueba gratis/);
  assert.match(msg, /cada año hasta que cancele/);
  assert.match(msg, /antes de que termine la prueba/);
  assert.match(msg, /conservar el acceso hasta que termine la prueba/);
  assert.doesNotMatch(msg, /periodo pagado/);
  assert.doesNotMatch(msg, /ahora y/);
  assert.match(p.custom_text.submit.message, /Gratis por 7 días/);
});

test("no trial (null, undefined, 0) keeps the charge-now text in both locales", () => {
  for (const trialDays of [null, undefined, 0]) {
    const en = recurringConsentParams({ locale: "en", interval: "month", marketingOrigin: ORIGIN, trialDays });
    assert.match(en.custom_text.terms_of_service_acceptance.message, /charge my card the price shown now/);
    const es = recurringConsentParams({ locale: "es", interval: "month", marketingOrigin: ORIGIN, trialDays });
    assert.match(es.custom_text.terms_of_service_acceptance.message, /precio indicado ahora/);
  }
});

test("trial copy has no em dashes and fits Stripe's limit", () => {
  for (const locale of ["en", "es"]) {
    for (const interval of ["month", "year"] as const) {
      const p = recurringConsentParams({ locale, interval, marketingOrigin: ORIGIN, trialDays: 30 });
      for (const m of [p.custom_text.terms_of_service_acceptance.message, p.custom_text.submit.message]) {
        assert.ok(m.length <= 1200);
        assert.ok(!m.includes("\u2014"));
      }
    }
  }
});

for (const file of ["talent-billing.ts", "workspace-billing.ts"]) {
  test(`${file} passes the session's own trialDays into the consent copy`, () => {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(src, /\.\.\.recurringConsentParams\(\{[^}]*trialDays[^}]*\}\)/);
  });
}
