import { test } from "node:test";
import assert from "node:assert/strict";

import { pickLabel } from "./compare-table-locale";

/**
 * The fallback is the load-bearing behaviour here.
 *
 * A blank cell in a pricing table does not read as "we have not translated
 * this". It reads as "this plan does not include it". So a missing translation
 * must degrade to English, never to empty, or a content gap silently becomes a
 * false product claim.
 */

test("returns the locale's text when present", () => {
  assert.equal(
    pickLabel({ en: "Custom domain", es: "Dominio propio" }, "Custom domain", "es"),
    "Dominio propio",
  );
});

test("falls back to English when the locale is missing", () => {
  assert.equal(
    pickLabel({ en: "Custom domain" }, "Custom domain", "es"),
    "Custom domain",
  );
});

test("falls back when the map itself is null", () => {
  // Every row added before the locale columns existed looks like this.
  assert.equal(pickLabel(null, "Custom domain", "es"), "Custom domain");
});

test("falls back on null, empty and whitespace-only translations", () => {
  // An empty string is the dangerous one: it is a present key, so a naive
  // `?? fallback` keeps it and the cell renders blank.
  for (const bad of [null, "", "   "]) {
    assert.equal(
      pickLabel({ en: "Seats", es: bad }, "Seats", "es"),
      "Seats",
      `expected fallback for ${JSON.stringify(bad)}`,
    );
  }
});

test("an unknown locale falls back rather than throwing", () => {
  assert.equal(
    pickLabel({ en: "Seats", es: "Puestos" }, "Seats", "fr"),
    "Seats",
  );
});

test("English requests still read the map, not just the column", () => {
  assert.equal(pickLabel({ en: "Puestos wrong" }, "Seats", "en"), "Puestos wrong");
});

test("a non-object json value falls back rather than throwing", () => {
  // jsonb can hold a string, a number or an array. None of those is a locale
  // map, and none should reach the page as a label.
  for (const bad of ["just a string", 42, ["es"], true]) {
    assert.equal(pickLabel(bad, "Seats", "es"), "Seats");
  }
});
