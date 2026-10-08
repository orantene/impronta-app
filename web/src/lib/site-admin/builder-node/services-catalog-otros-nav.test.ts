import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG_UNCATEGORISED_TAB,
  catalogGroupNavLabel,
  catalogGroupTabKey,
} from "./catalog-group-nav";

// Catches: uncategorised services never get a category chip ("Otros" missing).
test("uncategorised catalog group has a stable tab key and Otros label", () => {
  assert.equal(catalogGroupTabKey(null), CATALOG_UNCATEGORISED_TAB);
  assert.equal(catalogGroupTabKey(undefined), CATALOG_UNCATEGORISED_TAB);
  assert.equal(catalogGroupTabKey("Lashes"), "Lashes");
  assert.equal(catalogGroupNavLabel({ name: null }, true), "Otros");
  assert.equal(catalogGroupNavLabel({ name: null }, false), "Other");
  assert.equal(catalogGroupNavLabel({ name: "Lashes", label: "Pestañas" }, true), "Pestañas");
});

// Catches: filtering a named tab must not keep showing the Otros bucket.
test("named and Otros tabs are distinct filter keys", () => {
  const named = catalogGroupTabKey("Gel");
  const other = catalogGroupTabKey(null);
  assert.notEqual(named, other);
  assert.equal(other, "__otros__");
});
