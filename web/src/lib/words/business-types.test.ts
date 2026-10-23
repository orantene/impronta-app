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
  // TUL-540: beauty salon before academy on the Spanish phrase.
  assert.equal(searchBusinessTypes("salón de belleza")[0]?.id, "beauty-salon");
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

test("pet grooming maps to its own preset", () => {
  assert.equal(BUSINESS_TYPES.find((r) => r.id === "pet-grooming")?.preset, "pet_grooming");
});

test("TUL-1163: everyday words find the trade they mean", () => {
  const first = (q: string) => searchBusinessTypes(q)[0]?.id;
  assert.equal(first("corte de pelo"), "hair-salon");
  assert.equal(first("corte de cabello"), "hair-salon");
  assert.equal(first("haircut"), "hair-salon");
  assert.equal(first("barbero"), "barber-shop");
  assert.equal(first("lashes"), "eyelash-studio");
  // A massage therapist is the first answer for "masaje"; the mobile service stays one tap away.
  assert.equal(first("masaje"), "massage-therapist");
  assert.ok(searchBusinessTypes("masaje").some((r) => r.id === "mobile-massage-service"));
});

test("TUL-1163: the new aliases do not steal each other's trades", () => {
  assert.ok(!searchBusinessTypes("barbero").some((r) => r.id === "hair-salon"));
  assert.ok(searchBusinessTypes("barber").some((r) => r.id === "barber-shop"));
  assert.ok(searchBusinessTypes("uñas").some((r) => r.id === "nail-salon"));
});

test("TUL-1161: dentist and doctor words land on the clinic row", () => {
  const first = (q: string) => searchBusinessTypes(q)[0]?.id;
  assert.equal(first("dentista"), "clinic");
  assert.equal(first("dentist"), "clinic");
  assert.equal(first("clínica dental"), "clinic");
  assert.equal(first("médico"), "clinic");
  assert.equal(first("consultorio"), "clinic");
});

test("TUL-349 (business path): bare 'cleaning' wins house-cleaner, never a mobile-detailing alias on the alphabetical tie-break", () => {
  const first = (q: string) => searchBusinessTypes(q)[0]?.id;
  assert.equal(first("cleaning"), "house-cleaner");
  assert.equal(first("Cleaning"), "house-cleaner");
  assert.equal(first("cleaner"), "house-cleaner");
  assert.equal(first("limpieza"), "house-cleaner");
  // Neighbouring "cleaning" verticals still get their own, more specific type.
  assert.equal(first("car cleaning"), "car-detailing");
  assert.equal(first("car detailing"), "car-detailing");
  assert.equal(first("office cleaning"), "commercial-cleaning-company");
  assert.equal(first("garment cleaning"), "dry-cleaning-service");
  assert.equal(first("dry cleaning"), "dry-cleaning-service");
});
