/**
 * MODE-1/2/3/6 — CTA matrix vs booking settings (unit).
 * Instant confirm / approval request / quote inquiry labels + actions.
 * Does not claim LIVE tip or browser E2E PASS.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogRowCtaLabel,
} from "@/components/public-booking/catalog-booking-logic";
import { resolveOfferingCta } from "@/lib/talent/offerings-types";
import {
  resolveWhoPrimaryAction,
  whoStepPrimaryLabel,
} from "@/lib/talent/selling-booking-settings";

const base = {
  visibility: "public" as const,
  variants: [] as [],
  addOns: [] as [],
  amountCents: 5000 as number | null,
  durationMinutes: 60 as number | null,
};

test("MODE-1 instant: on-demand + confirm_now → Confirm now / Confirmar cita", () => {
  const offering = {
    ...base,
    kind: "service" as const,
    bookingMode: "instant" as const,
    priceType: "flat_package" as const,
    priceDisplay: "exact" as const,
  };
  assert.equal(resolveOfferingCta(offering), "book_now");
  assert.equal(
    catalogRowCtaLabel({ selected: false, offering, locale: "es" }),
    "Seleccionar",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "confirm_now",
      offeringIntent: "instant",
    }),
    "confirm",
  );
  assert.equal(
    whoStepPrimaryLabel({
      action: "confirm",
      whoPrimaryCta: "confirm_now",
      locale: "es",
    }),
    "Confirmar cita",
  );
  assert.equal(
    whoStepPrimaryLabel({
      action: "confirm",
      whoPrimaryCta: "confirm_now",
      locale: "en",
    }),
    "Confirm now",
  );
});

test("MODE-2 approval/request: request_to_book → Solicitar cita; who stays chat", () => {
  const offering = {
    ...base,
    kind: "service" as const,
    bookingMode: "request" as const,
    priceType: "flat_package" as const,
    priceDisplay: "exact" as const,
  };
  assert.equal(resolveOfferingCta(offering), "request_to_book");
  assert.equal(
    catalogRowCtaLabel({ selected: false, offering, locale: "es" }),
    "Solicitar cita",
  );
  assert.equal(
    catalogRowCtaLabel({ selected: false, offering, locale: "en" }),
    "Request appointment",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "confirm_now",
      offeringIntent: "request",
    }),
    "chat",
  );
  assert.equal(
    whoStepPrimaryLabel({
      action: "chat",
      whoPrimaryCta: "confirm_now",
      locale: "es",
    }),
    "Chatea ahora",
  );
});

test("MODE-3 quote: ask_quote → Pedir cotización / Request a quote", () => {
  const offering = {
    ...base,
    kind: "service" as const,
    bookingMode: "request" as const,
    priceType: "custom" as const,
    priceDisplay: "quote" as const,
    amountCents: null,
  };
  assert.equal(resolveOfferingCta(offering), "ask_quote");
  assert.equal(
    catalogRowCtaLabel({ selected: false, offering, locale: "es" }),
    "Pedir cotización",
  );
  assert.equal(
    catalogRowCtaLabel({ selected: false, offering, locale: "en" }),
    "Request a quote",
  );
});

test("MODE-6 contact / check availability who-step labels (not Confirm)", () => {
  assert.equal(
    whoStepPrimaryLabel({
      action: "chat",
      whoPrimaryCta: "contact",
      locale: "en",
    }),
    "Contact",
  );
  assert.equal(
    whoStepPrimaryLabel({
      action: "chat",
      whoPrimaryCta: "check_availability",
      locale: "es",
    }),
    "Consultar disponibilidad",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "check_availability",
      offeringIntent: "instant",
    }),
    "chat",
  );
});

test("MODE-6 / F4 (WSF-B): inquiry default does NOT override a service's own instant mode", () => {
  const offering = {
    ...base,
    kind: "service" as const,
    bookingMode: "instant" as const,
    priceType: "flat_package" as const,
    priceDisplay: "exact" as const,
  };
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering,
      locale: "en",
      bookingPosture: "inquiry",
    }),
    "Select",
  );
  // The same service inheriting (null) follows the inquiry default.
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...offering, bookingMode: null },
      locale: "es",
      bookingPosture: "inquiry",
    }),
    "Consultar",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "contact",
      offeringIntent: "instant",
    }),
    "chat",
  );
});
