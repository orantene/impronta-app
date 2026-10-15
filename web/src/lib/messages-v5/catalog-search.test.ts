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
