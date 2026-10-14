import test from "node:test";
import assert from "node:assert/strict";
import { effectiveCatalogColumns } from "./services-catalog-columns";

test("one service collapses any grid to a single full-width column", () => {
  assert.equal(effectiveCatalogColumns(2, 1), 1);
  assert.equal(effectiveCatalogColumns(3, 1), 1);
});

test("fewer items than columns shrinks the grid; enough items keep it", () => {
  assert.equal(effectiveCatalogColumns(3, 2), 2);
  assert.equal(effectiveCatalogColumns(2, 5), 2);
  assert.equal(effectiveCatalogColumns(3, 3), 3);
});

test("empty lists and bad input never produce zero columns", () => {
  assert.equal(effectiveCatalogColumns(2, 0), 2);
  assert.equal(effectiveCatalogColumns(0, 4), 1);
  assert.equal(effectiveCatalogColumns(Number.NaN, 4), 1);
});
