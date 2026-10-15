import assert from "node:assert/strict";
import { test } from "node:test";

import { searchCatalogRows } from "./catalog-search";

const ROWS = [
  { title: "Manicura clásica", sub: "45 min" },
  { title: "Pedicure spa", sub: "60 min" },
  { title: "Retrato de estudio", sub: null },
];

test("an empty query returns every row", () => {
  assert.equal(searchCatalogRows(ROWS, "  ").length, 3);
});

test("matching ignores case and accents", () => {
  assert.deepEqual(searchCatalogRows(ROWS, "MANICURA").map((r) => r.title), ["Manicura clásica"]);
  assert.deepEqual(searchCatalogRows(ROWS, "clasica").map((r) => r.title), ["Manicura clásica"]);
});

test("every word must match, across title and subtitle", () => {
  assert.deepEqual(searchCatalogRows(ROWS, "spa 60").map((r) => r.title), ["Pedicure spa"]);
  assert.equal(searchCatalogRows(ROWS, "spa 45").length, 0);
});

import { onlyAvailableRows, sortCatalogRows } from "./catalog-search";

const PRICED = [
  { id: "a", amountCents: 3000, available: true },
  { id: "b", amountCents: null, available: true },
  { id: "c", amountCents: 1000, available: false },
];

test("price sort puts unpriced rows last in both directions", () => {
  assert.deepEqual(sortCatalogRows(PRICED, "price_asc").map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(sortCatalogRows(PRICED, "price_desc").map((r) => r.id), ["a", "c", "b"]);
  assert.deepEqual(sortCatalogRows(PRICED, "default").map((r) => r.id), ["a", "b", "c"]);
});

test("the availability filter keeps only bookable rows", () => {
  assert.deepEqual(onlyAvailableRows(PRICED, true).map((r) => r.id), ["a", "b"]);
  assert.equal(onlyAvailableRows(PRICED, false).length, 3);
});

import { maxDurationRows } from "./catalog-search";

test("the duration filter drops longer rows but keeps rows with no length", () => {
  const rows = [{ id: "a", durationMinutes: 45 }, { id: "b", durationMinutes: 120 }, { id: "c", durationMinutes: null }];
  assert.deepEqual(maxDurationRows(rows, 60).map((r) => r.id), ["a", "c"]);
  assert.equal(maxDurationRows(rows, null).length, 3);
});
