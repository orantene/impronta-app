/**
 * Visible-field checkbox ↔ render default alignment (dead-control guard).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SERVICES_CATALOG_DEFAULT_PROPS,
  SERVICES_CATALOG_VISIBLE_FIELD_KEYS,
  resolveServicesCatalogSheetAccent,
  servicesCatalogVisibleFieldChecked,
} from "./services-catalog-defaults";

test("opt-in visible fields stay unchecked when unset (match render === true)", () => {
  for (const key of ["showCategory", "showDelivery", "showAvailability", "showBadges"] as const) {
    assert.equal(SERVICES_CATALOG_DEFAULT_PROPS[key], false);
    assert.equal(servicesCatalogVisibleFieldChecked({}, key), false);
    assert.equal(servicesCatalogVisibleFieldChecked({ [key]: true }, key), true);
    assert.equal(servicesCatalogVisibleFieldChecked({ [key]: false }, key), false);
  }
});

test("opt-out visible fields stay checked when unset (match render !== false)", () => {
  for (const key of [
    "showStats",
    "showPhoto",
    "showDescription",
    "showDuration",
    "showPrice",
    "showUsdEquivalent",
  ] as const) {
    assert.equal(SERVICES_CATALOG_DEFAULT_PROPS[key], true);
    assert.equal(servicesCatalogVisibleFieldChecked({}, key), true);
    assert.equal(servicesCatalogVisibleFieldChecked({ [key]: false }, key), false);
    assert.equal(servicesCatalogVisibleFieldChecked({ [key]: true }, key), true);
  }
});

test("visible field key list matches Content inspector set", () => {
  assert.deepEqual([...SERVICES_CATALOG_VISIBLE_FIELD_KEYS], [
    "showStats",
    "showPhoto",
    "showDescription",
    "showCategory",
    "showDuration",
    "showDelivery",
    "showAvailability",
    "showPrice",
    "showUsdEquivalent",
    "showBadges",
  ]);
});

test("sheet accent ink passes through (not coerced to primary)", () => {
  assert.equal(resolveServicesCatalogSheetAccent("ink"), "ink");
  assert.equal(resolveServicesCatalogSheetAccent("primary"), "primary");
  assert.equal(resolveServicesCatalogSheetAccent(undefined), "primary");
});
