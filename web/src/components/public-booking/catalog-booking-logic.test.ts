import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogCanContinueWhen,
  catalogNeedsOptions,
  catalogRowCtaLabel,
  catalogTotalCents,
  catalogWillWriteBooking,
  demoSlotsFor,
  submitCatalogBooking,
} from "./catalog-booking-logic";

const base = {
  amountCents: 30000,
  variants: [] as { id: string; label: string; amountCents: number | null }[],
  addOns: [] as { id: string; label: string; amountCents: number }[],
};

test("extras change the live total", () => {
  const detail = {
    ...base,
    addOns: [
      { id: "a", label: "French", amountCents: 8000 },
      { id: "b", label: "Art", amountCents: 12000 },
    ],
  };
  assert.equal(catalogTotalCents(detail, null, []), 30000);
  assert.equal(catalogTotalCents(detail, null, ["a"]), 38000);
  assert.equal(catalogTotalCents(detail, null, ["a", "b"]), 50000);
});

test("a required variant replaces the base price", () => {
  const detail = {
    ...base,
    variants: [
      { id: "short", label: "Corto", amountCents: 25000 },
      { id: "long", label: "Largo", amountCents: 40000 },
    ],
  };
  assert.equal(catalogTotalCents(detail, "long", []), 40000);
});

test("Continue on when is disabled without a slot", () => {
  assert.equal(catalogCanContinueWhen(null), false);
  assert.equal(catalogCanContinueWhen("10:00"), true);
});

test("options are required when extras or variants exist", () => {
  assert.equal(catalogNeedsOptions(base), false);
  assert.equal(catalogNeedsOptions({ ...base, addOns: [{ id: "a", label: "x", amountCents: 1 }] }), true);
});

test("only the published instant path writes a booking", async () => {
  assert.equal(catalogWillWriteBooking("demo", "instant"), false);
  assert.equal(catalogWillWriteBooking("live", "request"), false);
  assert.equal(catalogWillWriteBooking("live", "instant"), true);
  const demo = await submitCatalogBooking("demo", "instant", async () => "wrote");
  assert.equal(demo.wrote, false);
  const live = await submitCatalogBooking("live", "instant", async () => "wrote");
  assert.equal(live.wrote, true);
  assert.equal(live.result, "wrote");
});

test("Sunday has no demo hours", () => {
  const sunday = new Date(2026, 8, 6);
  assert.equal(sunday.getDay(), 0);
  assert.deepEqual(demoSlotsFor(sunday, 60), []);
});

test("row CTA follows Maison labels", () => {
  const offering = {
    visibility: "public" as const,
    variants: [],
    addOns: [],
    kind: "service" as const,
    bookingMode: "instant" as const,
    priceType: "flat_package" as const,
    priceDisplay: "exact" as const,
    amountCents: 100,
  };
  assert.equal(catalogRowCtaLabel({ selected: false, offering, locale: "es" }), "Seleccionar");
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...offering, addOns: [{ id: "1", label: "x", amountCents: 1 }] },
      locale: "es",
    }),
    "Elegir opciones",
  );
  assert.equal(
    catalogRowCtaLabel({ selected: false, offering: { ...offering, visibility: "on_request" }, locale: "es" }),
    "Consultar",
  );
  assert.equal(catalogRowCtaLabel({ selected: true, offering, locale: "es" }), "Seleccionado");
  assert.equal(
    catalogRowCtaLabel({ selected: false, offering, locale: "es", inspectorLabel: "Reservar" }),
    "Reservar",
  );
  // CMS "Seleccionar" must not wipe Elegir opciones on Soft Gel-style rows.
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...offering, variants: [{ id: "v1", label: "Largo #3", amountCents: 55000 }] },
      locale: "es",
      inspectorLabel: "Seleccionar",
    }),
    "Elegir opciones",
  );
});
