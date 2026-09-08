import { test } from "node:test";
import assert from "node:assert/strict";
import { INDUSTRY_PRESET_IDS } from "./presets";
import {
  BUSINESS_FAMILIES,
  BUSINESS_TYPE_CATALOG_TARGET,
  BUSINESS_TYPES,
  searchBusinessTypes,
} from "./business-types";

test("twelve families", () => {
  assert.equal(BUSINESS_FAMILIES.length, 12);
});

test("every type has a known family, preset, and both labels", () => {
  const families = new Set<string>(BUSINESS_FAMILIES);
  const presets = new Set<string>(INDUSTRY_PRESET_IDS);
  const ids = new Set<string>();
  for (const row of BUSINESS_TYPES) {
    assert.ok(families.has(row.family), row.id);
    assert.ok(presets.has(row.preset), `${row.id} preset ${row.preset}`);
    assert.ok(row.label.en.length > 0 && row.label.es.length > 0, row.id);
    assert.equal(ids.has(row.id), false, `duplicate ${row.id}`);
    ids.add(row.id);
  }
});

test("search matches EN, ES and aliases", () => {
  assert.ok(searchBusinessTypes("uñas").some((r) => r.id === "nail-salon"));
  assert.ok(searchBusinessTypes("restaurante").some((r) => r.id === "restaurant"));
});

test("catalog target stays 120; fill-in waits on the product documents", () => {
  assert.equal(BUSINESS_TYPE_CATALOG_TARGET, 120);
  assert.ok(BUSINESS_TYPES.length <= BUSINESS_TYPE_CATALOG_TARGET);
});
