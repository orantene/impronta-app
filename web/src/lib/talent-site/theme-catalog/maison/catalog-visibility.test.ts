/**
 * Maison catalog visibility — flags-off must hide Maison rows.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  filterCatalogRowsForMaisonFlag,
  isMaisonCatalogSlug,
  MAISON_DESIGN_SLUG,
} from "./catalog-visibility";

test("isMaisonCatalogSlug matches design, palettes, demos", () => {
  assert.equal(isMaisonCatalogSlug("maison"), true);
  assert.equal(isMaisonCatalogSlug("maison-pink"), true);
  assert.equal(isMaisonCatalogSlug("maison-nails"), true);
  assert.equal(isMaisonCatalogSlug("Maison-Pearl"), true);
  assert.equal(isMaisonCatalogSlug("default"), false);
  assert.equal(isMaisonCatalogSlug("editorial"), false);
  assert.equal(isMaisonCatalogSlug("modern"), false);
});

test("filterCatalogRowsForMaisonFlag: flags off drops Maison only", () => {
  const rows = [
    { slug: "default" },
    { slug: MAISON_DESIGN_SLUG },
    { slug: "maison-pink" },
    { slug: "modern" },
    { slug: "maison-nails" },
  ];
  const filtered = filterCatalogRowsForMaisonFlag(rows, false);
  assert.deepEqual(
    filtered.map((r) => r.slug),
    ["default", "modern"],
  );
});

test("filterCatalogRowsForMaisonFlag: flags on keeps Maison", () => {
  const rows = [{ slug: "default" }, { slug: "maison" }, { slug: "maison-pink" }];
  const filtered = filterCatalogRowsForMaisonFlag(rows, true);
  assert.equal(filtered.length, 3);
});
