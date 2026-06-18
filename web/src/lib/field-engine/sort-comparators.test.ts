/**
 * Unit tests for sort-comparators.ts (FIELD-2).
 *
 * Assertions:
 *  1. byLabel / byName never throw on undefined / null label/name.
 *  2. Sort is deterministic (identical items compare as 0).
 *  3. Secondary-key sort is preserved when byLabel is used as a tiebreaker.
 *  4. Items with defined labels sort before empty-string-coerced undefineds.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { byLabel, byName, byStringKey } from "./sort-comparators";

describe("byLabel", () => {
  test("does not throw when label is undefined", () => {
    const a = { label: undefined as unknown as string };
    const b = { label: "Musician" };
    assert.doesNotThrow(() => byLabel(a, b));
    assert.doesNotThrow(() => byLabel(b, a));
  });

  test("does not throw when label is null", () => {
    const a = { label: null as unknown as string };
    const b = { label: "Actor" };
    assert.doesNotThrow(() => byLabel(a, b));
  });

  test("coerces null/undefined to empty string for comparison", () => {
    const items = [
      { label: "Zebra", id: 1 },
      { label: null as unknown as string, id: 2 },
      { label: "Apple", id: 3 },
      { label: undefined as unknown as string, id: 4 },
    ];
    const sorted = [...items].sort(byLabel);
    // null and undefined → "" so they sort before "Apple"
    assert.equal(sorted[0].id === 2 || sorted[0].id === 4, true);
    assert.equal(sorted[1].id === 2 || sorted[1].id === 4, true);
    assert.equal(sorted[2].id, 3); // "Apple"
    assert.equal(sorted[3].id, 1); // "Zebra"
  });

  test("identical labels compare as 0 (stable by identity)", () => {
    const a = { label: "Photographer" };
    const b = { label: "Photographer" };
    assert.equal(byLabel(a, b), 0);
  });

  test("sorts alphabetically for non-null labels", () => {
    const items = [
      { label: "Chef" },
      { label: "Actor" },
      { label: "Baker" },
    ];
    const sorted = [...items].sort(byLabel);
    assert.equal(sorted[0].label, "Actor");
    assert.equal(sorted[1].label, "Baker");
    assert.equal(sorted[2].label, "Chef");
  });

  test("secondary key preserved when used as tiebreaker", () => {
    const items = [
      { displayOrder: 1, label: "Zebra" },
      { displayOrder: 1, label: "Apple" },
      { displayOrder: 2, label: "Mango" },
    ];
    const sorted = [...items].sort(
      (a, b) => a.displayOrder - b.displayOrder || byLabel(a, b),
    );
    // primary key: displayOrder 1 < 2
    assert.equal(sorted[2].label, "Mango");
    // within displayOrder=1, alphabetical tiebreak
    assert.equal(sorted[0].label, "Apple");
    assert.equal(sorted[1].label, "Zebra");
  });
});

describe("byName", () => {
  test("does not throw when name is undefined", () => {
    const a = { name: undefined as unknown as string };
    const b = { name: "Agency" };
    assert.doesNotThrow(() => byName(a, b));
  });

  test("does not throw when name is null", () => {
    const a = { name: null as unknown as string };
    const b = { name: "Studio" };
    assert.doesNotThrow(() => byName(a, b));
  });

  test("sorts alphabetically for non-null names", () => {
    const items = [{ name: "Zara" }, { name: "Ana" }, { name: "Maya" }];
    const sorted = [...items].sort(byName);
    assert.equal(sorted[0].name, "Ana");
    assert.equal(sorted[1].name, "Maya");
    assert.equal(sorted[2].name, "Zara");
  });

  test("null/undefined name sorts before any string", () => {
    const items = [
      { name: "Beta" },
      { name: null as unknown as string },
    ];
    const sorted = [...items].sort(byName);
    assert.equal(sorted[0].name, null); // "" < "Beta"
    assert.equal(sorted[1].name, "Beta");
  });
});

describe("byStringKey", () => {
  test("does not throw when key value is null or undefined", () => {
    const comparator = byStringKey<{ field_key?: string | null }>("field_key");
    const a = { field_key: null };
    const b = { field_key: "key_b" };
    assert.doesNotThrow(() => comparator(a, b));
  });

  test("sorts by arbitrary key correctly", () => {
    const comparator = byStringKey<{ field_key: string }>("field_key");
    const items = [{ field_key: "z_key" }, { field_key: "a_key" }];
    const sorted = [...items].sort(comparator);
    assert.equal(sorted[0].field_key, "a_key");
  });
});
