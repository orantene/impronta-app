/**
 * Theme collection v1 designs: validate, deterministic, flag-gated, distinct.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateDesign } from "../validate";
import { isMaisonCatalogSlug } from "../maison/catalog-visibility";
import { COLLECTION_DESIGNS, isCollectionDesignSlug } from "./designs";

for (const d of COLLECTION_DESIGNS) {
  test(`${d.slug} validates as a Design`, () => {
    const res = validateDesign(d.buildPayload());
    assert.deepEqual(res.errors, []);
    assert.equal(res.ok, true);
  });
}

test("payloads are deterministic (stable sync hash)", () => {
  for (const d of COLLECTION_DESIGNS) {
    assert.equal(JSON.stringify(d.buildPayload()), JSON.stringify(d.buildPayload()));
  }
});

test("every collection slug is flag-gated with Maison", () => {
  for (const d of COLLECTION_DESIGNS) {
    assert.equal(isCollectionDesignSlug(d.slug), true);
    assert.equal(isMaisonCatalogSlug(d.slug), true);
  }
  assert.equal(isMaisonCatalogSlug("editorial"), false);
});

test("the five designs are structurally distinct (section order differs)", () => {
  const orders = COLLECTION_DESIGNS.map((d) =>
    d
      .buildPayload()
      .homeTree.map((n) => String((n.props as Record<string, unknown>).slotKey))
      .join(">"),
  );
  assert.equal(new Set(orders).size, orders.length);
});
