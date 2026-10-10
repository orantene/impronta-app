import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogSheetSummaryCaption,
  catalogSheetSummaryCents,
} from "./catalog-booking-price";
import { catalogRowMinCents } from "./catalog-booking-logic";

/** Alex Treviño "Revisión eléctrica": Casa 550 / Departamento 500 / Local 800. */
const revision = {
  priceDisplay: "exact" as const,
  priceType: "flat_package",
  amountCents: 55000,
  variants: [
    { id: "casa", label: "Casa", amountCents: 55000 },
    { id: "depa", label: "Departamento", amountCents: 50000 },
    { id: "local", label: "Local comercial", amountCents: 80000 },
  ],
};

test("catalog From floor is the cheapest option (TUL-516 price mismatch)", () => {
  assert.equal(catalogRowMinCents(revision), 50000);
});

test("sheet summary uses From floor until an option is picked", () => {
  assert.equal(catalogSheetSummaryCents(revision, null), 50000);
  assert.equal(catalogSheetSummaryCaption(revision, null, "en"), "From");
  assert.equal(catalogSheetSummaryCaption(revision, null, "es"), "Desde");
});

test("sheet summary Base price matches the selected option", () => {
  assert.equal(catalogSheetSummaryCents(revision, "casa"), 55000);
  assert.equal(catalogSheetSummaryCents(revision, "depa"), 50000);
  assert.equal(catalogSheetSummaryCents(revision, "local"), 80000);
  assert.equal(catalogSheetSummaryCaption(revision, "depa", "en"), "Base price");
  assert.equal(catalogSheetSummaryCaption(revision, "depa", "es"), "Precio base");
});

test("single-price rows keep Base price and the offering amount", () => {
  const exact = { priceDisplay: "exact" as const, priceType: "flat_package", amountCents: 35000, variants: [] };
  assert.equal(catalogSheetSummaryCents(exact, null), 35000);
  assert.equal(catalogSheetSummaryCaption(exact, null, "en"), "Base price");
});
