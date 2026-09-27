import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogBookingDurationMinutes,
  catalogCanContinueWhen,
  catalogCollectNowCents,
  catalogDetailIsPurchase,
  catalogIsPurchaseEligible,
  catalogNeedsOptions,
  catalogRowCtaLabel,
  catalogRowOpensSheetImmediately,
  catalogSelectedStartStillOpen,
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

test("plain Seleccionar does not open the sheet; options and on-request do", () => {
  const plain = { visibility: "public" as const, variants: [], addOns: [] };
  assert.equal(catalogRowOpensSheetImmediately(plain), false);
  assert.equal(
    catalogRowOpensSheetImmediately({
      ...plain,
      addOns: [{ id: "a", label: "French", amountCents: 8000 }],
    }),
    true,
  );
  assert.equal(
    catalogRowOpensSheetImmediately({
      ...plain,
      variants: [{ id: "v", label: "Largo #3", amountCents: 55000 }],
    }),
    true,
  );
  assert.equal(
    catalogRowOpensSheetImmediately({ ...plain, visibility: "on_request" }),
    true,
  );
});

test("purchase-eligible products and untimed packages get Buy; timed packages stay Select", () => {
  const product = {
    visibility: "public" as const,
    variants: [],
    addOns: [],
    kind: "product" as const,
    bookingMode: "instant" as const,
    priceType: "flat_package" as const,
    priceDisplay: "exact" as const,
    amountCents: 5000,
    durationMinutes: null as number | null,
  };
  assert.equal(catalogIsPurchaseEligible(product), true);
  assert.equal(catalogRowCtaLabel({ selected: false, offering: product, locale: "es" }), "Comprar");
  assert.equal(catalogRowCtaLabel({ selected: false, offering: product, locale: "en" }), "Buy");

  const untimedPkg = { ...product, kind: "package" as const, durationMinutes: 0 };
  assert.equal(catalogIsPurchaseEligible(untimedPkg), true);
  assert.equal(catalogRowCtaLabel({ selected: false, offering: untimedPkg, locale: "es" }), "Comprar");

  const timedPkg = { ...product, kind: "package" as const, durationMinutes: 90 };
  assert.equal(catalogIsPurchaseEligible(timedPkg), false);
  assert.equal(catalogRowCtaLabel({ selected: false, offering: timedPkg, locale: "es" }), "Seleccionar");

  assert.equal(
    catalogDetailIsPurchase({
      kind: "product",
      intent: "instant",
      durationMinutes: null,
      amountCents: 5000,
    }),
    true,
  );
  assert.equal(
    catalogDetailIsPurchase({
      kind: "package",
      intent: "instant",
      durationMinutes: 60,
      amountCents: 5000,
    }),
    false,
  );
  assert.equal(
    catalogDetailIsPurchase({
      kind: "product",
      intent: "request",
      durationMinutes: null,
      amountCents: 5000,
    }),
    false,
  );

  // Manual confirm / effective request_to_book must not promise Buy.
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: product,
      locale: "en",
      confirmsByHand: true,
    }),
    "Request appointment",
  );
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: product,
      locale: "es",
      confirmsByHand: true,
    }),
    "Solicitar cita",
  );
});

test("collect-now cents follow reserveMode (full / deposit / free)", () => {
  assert.equal(catalogCollectNowCents(10_000, "full", null), 10_000);
  assert.equal(catalogCollectNowCents(10_000, "deposit", 30), 3_000);
  assert.equal(catalogCollectNowCents(10_000, "free", null), 0);
  assert.equal(catalogCollectNowCents(null, "deposit", 30), null);
  assert.equal(catalogCollectNowCents(10_000, "deposit", 0), 10_000);
  assert.equal(catalogCollectNowCents(10_000, "deposit", 100), 10_000);
});

test("extras with durationMinutes lengthen the booking window", () => {
  const addOns = [
    { id: "fr", durationMinutes: 15 },
    { id: "art", durationMinutes: 20 },
    { id: "free", durationMinutes: null },
  ];
  assert.equal(catalogBookingDurationMinutes(75, addOns, []), 75);
  assert.equal(catalogBookingDurationMinutes(75, addOns, ["fr"]), 90);
  assert.equal(catalogBookingDurationMinutes(75, addOns, ["fr", "art"]), 110);
  assert.equal(catalogBookingDurationMinutes(75, addOns, ["free"]), 75);
  assert.equal(catalogBookingDurationMinutes(null, addOns, ["fr"]), 75);
});

test("a selected start is dropped when the longer duration removes it", () => {
  const open = ["2026-09-25T15:00:00.000Z", "2026-09-25T16:00:00.000Z"];
  assert.equal(catalogSelectedStartStillOpen("2026-09-25T15:00:00.000Z", open), true);
  assert.equal(catalogSelectedStartStillOpen("2026-09-25T15:00:00.000Z", open.slice(1)), false);
  assert.equal(catalogSelectedStartStillOpen(null, open), false);
});
