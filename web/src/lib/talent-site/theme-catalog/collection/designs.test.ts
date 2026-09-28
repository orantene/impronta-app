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

/** W-01 — Maison v2 menu uses sticky category rail (chips on phone via CSS). */
test("maison-v2 services_catalog uses categoryNav rail + rows", () => {
  const maison = COLLECTION_DESIGNS.find((d) => d.slug === "maison-v2");
  assert.ok(maison);
  const found: Array<Record<string, unknown>> = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as { kind?: string; props?: Record<string, unknown>; children?: unknown };
      if (node.kind === "services_catalog" && node.props) found.push(node.props);
      walk(node.children);
    }
  };
  walk(maison!.buildPayload().homeTree);
  assert.equal(found.length, 1);
  assert.equal(found[0].categoryNav, "rail");
  assert.equal(found[0].layout, "rows");
  assert.equal(found[0].showPhoto, true);
});
