import test from "node:test";
import assert from "node:assert/strict";

import { TULALA_BRAND } from "@/lib/brand/tulala";

import { seoDescriptionFallback } from "./seo-description-fallback";

test("stored description wins", () => {
  assert.equal(
    seoDescriptionFallback({
      locale: "es",
      stored: "Manicura de lujo",
      bio: "Bio larga",
      name: "Rosa",
    }),
    "Manicura de lujo",
  );
});

test("ES-primary with Spanish bio: never the English Tulala brand blurb", () => {
  const out = seoDescriptionFallback({
    locale: "es",
    stored: null,
    bio: "Rosa es manicurista en Playa del Carmen. Citas a domicilio.",
    name: "Rosa r5a",
    talentType: "Manicurista",
    city: "Playa del Carmen",
  });
  assert.ok(out);
  assert.match(out!, /Rosa|manicurista|Playa/i);
  assert.ok(!out!.includes(TULALA_BRAND.description.slice(0, 24)));
  assert.doesNotMatch(out!, /\b(booking request|portfolio, services)\b/i);
});

test("empty bio falls back to Spanish structured copy, not English platform", () => {
  const out = seoDescriptionFallback({
    locale: "es",
    name: "Rosa",
    talentType: "Manicurista",
    city: "Mérida",
  });
  assert.ok(out);
  assert.match(out!, /Rosa/);
  assert.match(out!, /Mérida|solicitud de reserva|portafolio/i);
  assert.doesNotMatch(out!, /booking request/i);
  assert.ok(!out!.includes(TULALA_BRAND.description.slice(0, 24)));
});

test("English visitor gets English structured fallback", () => {
  const out = seoDescriptionFallback({
    locale: "en",
    name: "Rosa",
    talentType: "Nail artist",
    city: "Playa del Carmen",
  });
  assert.ok(out);
  assert.match(out!, /booking request/i);
  assert.doesNotMatch(out!, /solicitud de reserva/i);
});

test("no name and no bio → null (caller leaves description unset)", () => {
  assert.equal(seoDescriptionFallback({ locale: "es" }), null);
});
