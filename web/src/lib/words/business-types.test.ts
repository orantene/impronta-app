import { test } from "node:test";
import assert from "node:assert/strict";
import { INDUSTRY_PRESET_IDS } from "./presets";
import {
  BUSINESS_FAMILIES,
  BUSINESS_TYPE_CATALOG_TARGET,
  BUSINESS_TYPES,
  catalogBusinessTypes,
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

test("search matches EN, ES, aliases and accent-folded unas", () => {
  assert.ok(searchBusinessTypes("uñas").some((r) => r.id === "nail-salon"));
  assert.ok(searchBusinessTypes("unas").some((r) => r.id === "nail-salon"));
  assert.ok(searchBusinessTypes("restaurante").some((r) => r.id === "restaurant"));
  assert.ok(searchBusinessTypes("mantenimiento del hogar").some((r) => r.id === "handyman"));
});

test("catalog reaches 120 excluding custom fallback", () => {
  assert.equal(BUSINESS_TYPE_CATALOG_TARGET, 120);
  assert.ok(catalogBusinessTypes().length >= BUSINESS_TYPE_CATALOG_TARGET);
  assert.ok(BUSINESS_TYPES.some((row) => row.id === "custom"));
  assert.ok(BUSINESS_TYPES.some((row) => row.id === "nail-salon"));
  assert.equal(
    BUSINESS_TYPES.find((row) => row.id === "handyman")?.label.es,
    "mantenimiento del hogar",
  );
});
