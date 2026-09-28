import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveOfferingCta, offeringCtaLabel } from "./offering-cta-derivation";
import { withEffectiveBookingMode } from "./offering-policy-resolver";
import type { OfferingBookingMode } from "./offerings-types";

const svc = (bookingMode: OfferingBookingMode | null, extra: object = {}) => ({
  kind: "service" as const,
  bookingMode,
  priceType: "flat_package" as const,
  priceDisplay: "exact" as const,
  amountCents: 5000,
  visibility: "public" as const,
  durationMinutes: 60,
  ...extra,
});

test("F4: default inquiry + service instant books instantly (matches the server)", () => {
  const d = deriveOfferingCta({ offering: svc("instant"), defaults: { bookingPosture: "inquiry" } });
  assert.equal(d.cta, "book_now");
  assert.equal(d.intent, "instant");
  assert.equal(d.eventName, "tulala:offering-instant");
});

test("inherited service follows the default: inquiry → Consultar via conversation", () => {
  const d = deriveOfferingCta({ offering: svc(null), defaults: { bookingPosture: "inquiry" } });
  assert.equal(d.effectiveMode, "inquiry");
  assert.equal(d.cta, "request");
  assert.equal(d.eventName, "tulala:offering-request");
  assert.equal(offeringCtaLabel(d.cta, "es"), "Consultar");
});

test("inherited service under an instant default books instantly", () => {
  const d = deriveOfferingCta({ offering: svc(null), defaults: { bookingPosture: "instant" } });
  assert.equal(d.cta, "book_now");
  assert.equal(d.instant, true);
});

test("inherited service under legacy on_demand / no default = instant", () => {
  for (const defaults of [{ bookingPosture: "on_demand" }, {}, undefined]) {
    const d = deriveOfferingCta({ offering: svc(null), defaults });
    assert.equal(d.cta, "book_now");
    assert.equal(d.eventName, "tulala:offering-instant");
  }
});

test("inherited service under a request default = request, slot picker", () => {
  for (const defaults of [{ bookingPosture: "request" }]) {
    const d = deriveOfferingCta({ offering: svc(null), defaults });
    assert.equal(d.cta, "request_to_book");
    assert.equal(d.eventName, "tulala:offering-slot");
  }
});

test("plan ceiling (confirmsByHand) still turns instant into a request in the sheet", () => {
  const d = deriveOfferingCta({ offering: svc("instant"), confirmsByHand: true });
  assert.equal(d.raw, "book_now");
  assert.equal(d.cta, "request_to_book");
  assert.equal(d.intent, "request");
  assert.equal(d.eventName, "tulala:offering-instant");
  // Inquiry-mode service goes to the conversation even under the ceiling.
  assert.equal(deriveOfferingCta({ offering: svc("inquiry"), confirmsByHand: true }).eventName, "tulala:offering-request");
});

test("quote always asks for a quote, whatever the mode", () => {
  const q = svc("instant", { priceDisplay: "quote", amountCents: null });
  assert.equal(deriveOfferingCta({ offering: q, defaults: { bookingPosture: "instant" } }).cta, "ask_quote");
  assert.equal(offeringCtaLabel("ask_quote", "es"), "Pedir cotización");
});

test("unified labels: request Solicitar cita, inquiry Consultar, instant Reservar / Seleccionar", () => {
  assert.equal(offeringCtaLabel("request_to_book", "es"), "Solicitar cita");
  assert.equal(offeringCtaLabel("request", "es"), "Consultar");
  assert.equal(offeringCtaLabel("book_now", "es", "card"), "Reservar");
  assert.equal(offeringCtaLabel("book_now", "es", "catalog"), "Seleccionar");
  assert.equal(offeringCtaLabel("buy_now", "en"), "Buy");
});

test("public loaders resolve an inherited mode; explicit modes untouched", () => {
  assert.equal(withEffectiveBookingMode(svc(null), { bookingPosture: "instant" }).bookingMode, "instant");
  assert.equal(withEffectiveBookingMode(svc(null), { bookingPosture: "on_demand" }).bookingMode, "instant");
  assert.equal(withEffectiveBookingMode(svc("request"), { bookingPosture: "instant" }).bookingMode, "request");
});
