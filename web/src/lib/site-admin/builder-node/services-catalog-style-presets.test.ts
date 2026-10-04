import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SERVICES_CATALOG_STYLE_PRESETS,
  servicesCatalogStylePresetCommit,
} from "./services-catalog-style-presets";

test("four named style presets cover the five-settings challenge targets", () => {
  assert.deepEqual(
    SERVICES_CATALOG_STYLE_PRESETS.map((p) => p.id),
    ["clean", "editorial", "compact", "image_led"],
  );
});

test("stylePreset commit stamps id and concrete presentation props", () => {
  const compact = servicesCatalogStylePresetCommit("compact");
  assert.equal(compact.stylePreset, "compact");
  assert.equal(compact.layout, "compact_list");
  assert.equal(compact.categoryNav, "tabs");
  assert.equal(compact.showPhoto, false);

  const imageLed = servicesCatalogStylePresetCommit("image_led");
  assert.equal(imageLed.stylePreset, "image_led");
  assert.equal(imageLed.layout, "cards");
  assert.equal(imageLed.showPhoto, true);
  assert.equal(imageLed.categoryNav, "pills");
});
