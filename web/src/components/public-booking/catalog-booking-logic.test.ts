import assert from "node:assert/strict";
import { test } from "node:test";

import {
  offeringPriceUnit,
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
  resolveCatalogConfirmOutcome,
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

test("confirm outcome: slotTaken / payment missing / redirect / studio done", () => {
  assert.equal(
    resolveCatalogConfirmOutcome({
      wrote: false,
      result: null,
      requiresOnlineCollect: false,
      locale: "es",
    }).kind,
    "preview_done",
  );
  const taken = resolveCatalogConfirmOutcome({
    wrote: true,
    result: { ok: false, slotTaken: true, error: "taken" },
    requiresOnlineCollect: false,
    locale: "es",
  });
  assert.equal(taken.kind, "slot_taken");
  if (taken.kind === "slot_taken") assert.equal(taken.message, "taken");

  const payMissing = resolveCatalogConfirmOutcome({
    wrote: true,
    result: { ok: true, redirectPath: "" },
    requiresOnlineCollect: true,
    locale: "es",
  });
  assert.equal(payMissing.kind, "payment_missing");
  if (payMissing.kind === "payment_missing") assert.match(payMissing.message, /pago/i);

  const redirect = resolveCatalogConfirmOutcome({
    wrote: true,
    result: { ok: true, redirectPath: "https://checkout.example/c" },
    requiresOnlineCollect: true,
    locale: "en",
  });
  assert.deepEqual(redirect, { kind: "redirect", path: "https://checkout.example/c" });

  assert.equal(
    resolveCatalogConfirmOutcome({
      wrote: true,
      result: { ok: true, redirectPath: "" },
      requiresOnlineCollect: false,
      locale: "es",
    }).kind,
    "done",
  );
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
    // Instant rows with options say Seleccionar (Maison v2 proposal) and the
    // tap opens the option picker (catalogRowOpensSheetImmediately below).
    "Seleccionar",
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
  // Options rows ignore an inspector rename: the label stays the plain Select
  // (a stored "Reservar" must not promise a direct booking on an options row).
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...offering, variants: [{ id: "v1", label: "Largo #3", amountCents: 55000 }] },
      locale: "es",
      inspectorLabel: "Reservar",
    }),
    "Seleccionar",
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

  // F4 (WSF-B): the inquiry DEFAULT applies only to services that inherit.
  // An explicit instant product keeps Buy (the server accepts it); the same
  // product inheriting (null) asks first.
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: product,
      locale: "en",
      bookingPosture: "inquiry",
    }),
    "Buy",
  );
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...product, bookingMode: null },
      locale: "en",
      bookingPosture: "inquiry",
    }),
    "Ask about this",
  );
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: {
        ...product,
        kind: "service" as const,
        bookingMode: "instant" as const,
        priceType: "flat_package" as const,
        priceDisplay: "exact" as const,
        amountCents: 5000,
        durationMinutes: 60,
      },
      locale: "es",
      bookingPosture: "inquiry",
    }),
    "Seleccionar",
  );
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: {
        ...product,
        kind: "service" as const,
        bookingMode: "request" as const,
        priceDisplay: "quote" as const,
        priceType: "custom" as const,
        amountCents: null,
      },
      locale: "en",
      bookingPosture: "request",
    }),
    "Request a quote",
  );
});

test("request / approval mode wins over CMS Seleccionar ctaLabel", () => {
  const requestOffering = {
    visibility: "public" as const,
    variants: [],
    addOns: [],
    kind: "service" as const,
    bookingMode: "request" as const,
    priceType: "flat_package" as const,
    priceDisplay: "exact" as const,
    amountCents: 100,
  };
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: requestOffering,
      locale: "es",
      inspectorLabel: "Seleccionar",
    }),
    "Solicitar cita",
  );
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: requestOffering,
      locale: "en",
      inspectorLabel: "Select",
    }),
    "Request appointment",
  );
  // Instant + confirmsByHand (approval posture) also ignores Seleccionar.
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...requestOffering, bookingMode: "instant" },
      locale: "es",
      inspectorLabel: "Seleccionar",
      confirmsByHand: true,
    }),
    "Solicitar cita",
  );
  // Inherited service under an inquiry default ignores Seleccionar: Consultar.
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...requestOffering, bookingMode: null },
      locale: "es",
      inspectorLabel: "Seleccionar",
      bookingPosture: "inquiry",
    }),
    "Consultar",
  );
  // Instant without force-request still allows inspector rename.
  assert.equal(
    catalogRowCtaLabel({
      selected: false,
      offering: { ...requestOffering, bookingMode: "instant" },
      locale: "es",
      inspectorLabel: "Reservar",
    }),
    "Reservar",
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

test("price unit reads a string or a per-locale map from attributes", () => {
  assert.equal(offeringPriceUnit({ price_unit: "uña" }, "es"), "uña");
  assert.equal(offeringPriceUnit({ price_unit: { es: "uña", en: "nail" } }, "en-US"), "nail");
  assert.equal(offeringPriceUnit({ price_unit: { es: "uña", en: "nail" } }, "es"), "uña");
  assert.equal(offeringPriceUnit({ price_unit: "  " }, "es"), null);
  assert.equal(offeringPriceUnit({}, "es"), null);
  assert.equal(offeringPriceUnit(null, "es"), null);
});

test("DS-4: nearest alternatives skip the lost start and stay chronological", async () => {
  const { catalogNearestStarts, catalogTakenSlotMessage } = await import("./catalog-taken-slot");
  const open = [
    "2026-09-25T13:00:00.000Z",
    "2026-09-25T14:00:00.000Z",
    "2026-09-25T16:00:00.000Z",
    "2026-09-25T20:00:00.000Z",
    "2026-09-26T15:00:00.000Z",
  ];
  const got = catalogNearestStarts("2026-09-25T15:00:00.000Z", open);
  assert.deepEqual(got, ["2026-09-25T13:00:00.000Z", "2026-09-25T14:00:00.000Z", "2026-09-25T16:00:00.000Z"]);
  assert.deepEqual(catalogNearestStarts("2026-09-25T16:00:00.000Z", open).includes("2026-09-25T16:00:00.000Z"), false);
  assert.deepEqual(catalogNearestStarts(null, open), open.slice(0, 3));
  assert.deepEqual(catalogNearestStarts(null, []), []);
  assert.match(catalogTakenSlotMessage({ locale: "es", lostClock: "10:00", serverMessage: "x" }), /^Las 10:00 se acaban de ocupar/);
  assert.match(catalogTakenSlotMessage({ locale: "en", lostClock: "10:00", serverMessage: "x" }), /^10:00 was just taken/);
  assert.equal(catalogTakenSlotMessage({ locale: "en", lostClock: null, serverMessage: "x" }), "x");
});
