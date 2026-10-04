import assert from "node:assert/strict";
import { test } from "node:test";

import { recommendServicesCatalogLayout } from "./services-catalog-recommend";

test("photo-led catalogs recommend cards", () => {
  const r = recommendServicesCatalogLayout({ offeringCount: 6, withPhotoCount: 5 });
  assert.equal(r.layout, "cards");
});

test("many offerings without photos recommend compact_list", () => {
  const r = recommendServicesCatalogLayout({ offeringCount: 14, withPhotoCount: 2 });
  assert.equal(r.layout, "compact_list");
});

test("empty or mixed beauty-like catalogues default to rows", () => {
  assert.equal(recommendServicesCatalogLayout({ offeringCount: 0, withPhotoCount: 0 }).layout, "rows");
  assert.equal(recommendServicesCatalogLayout({ offeringCount: 5, withPhotoCount: 2 }).layout, "rows");
});
