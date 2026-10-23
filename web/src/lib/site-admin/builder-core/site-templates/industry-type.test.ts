import { test } from "node:test";
import assert from "node:assert/strict";
import { businessTypeFromIndustry } from "./industry-type";

/**
 * TUL-349 (business path regression): a cleaning business's stated industry
 * must resolve to the house-cleaner pack (the one with dedicated, trade-safe
 * stock coverage — see trade-label.test.ts / stock-hero.test.ts on the talent
 * path), never to an unrelated "cleaning"-adjacent type whose stock pool
 * falls through to the family/universal pack and can surface another
 * trade's hero photo (a chef, a makeup artist).
 */
test("TUL-349: a cleaning business's stated industry lands on house-cleaner", () => {
  const id = (industry: string) => businessTypeFromIndustry(industry)?.id;
  assert.equal(id("cleaning"), "house-cleaner");
  assert.equal(id("Cleaning"), "house-cleaner");
  assert.equal(id("cleaning services"), "house-cleaner");
  assert.equal(id("house cleaning"), "house-cleaner");
  assert.equal(id("home cleaning service"), "house-cleaner");
  assert.equal(id("limpieza"), "house-cleaner");
  assert.equal(id("limpieza de casas"), "house-cleaner");
  assert.equal(id("servicio de limpieza"), "house-cleaner");
});

test("TUL-349: neighbouring cleaning-adjacent industries keep their own, more specific type", () => {
  const id = (industry: string) => businessTypeFromIndustry(industry)?.id;
  assert.equal(id("car cleaning"), "car-detailing");
  assert.equal(id("car detailing"), "car-detailing");
  assert.equal(id("office cleaning"), "commercial-cleaning-company");
  assert.equal(id("garment cleaning"), "dry-cleaning-service");
  assert.equal(id("dry cleaning"), "dry-cleaning-service");
});
