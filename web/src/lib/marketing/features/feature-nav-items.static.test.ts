import assert from "node:assert/strict";
import { test } from "node:test";
import { FEATURE_NAV_ITEMS } from "./feature-nav-items";
import { MARKETING_FEATURES } from "./index";

/**
 * The nav projection exists so the client header does not import the whole
 * catalogue. That saving is only safe while the two agree, so this guard
 * compares them field by field: rename a feature or change a slug in the
 * catalogue without regenerating, and the header would quietly link readers
 * to a 404 or show them the old name.
 */
test("the nav projection matches the catalogue exactly", () => {
  const expected = MARKETING_FEATURES.map((f) => ({
    key: f.key,
    group: f.group,
    status: f.status,
    en: { name: f.en.name, path: `/features/${f.slugEn}` },
    es: { name: f.es.name, path: `/funciones/${f.slugEs}` },
  }));
  assert.deepEqual(
    FEATURE_NAV_ITEMS.map((i) => ({ ...i })),
    expected,
    "feature-nav-items.ts is stale. Regenerate it from the catalogue.",
  );
});

test("the projection carries every feature, in plate order", () => {
  assert.equal(FEATURE_NAV_ITEMS.length, 21);
  assert.deepEqual(
    FEATURE_NAV_ITEMS.map((i) => i.key),
    MARKETING_FEATURES.map((f) => f.key),
  );
});
