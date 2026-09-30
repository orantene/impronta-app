import assert from "node:assert/strict";
import { test } from "node:test";

import { coverage } from "./translation-coverage";

test("coverage counts only fields with primary text", () => {
  const fields = [
    { plain: "Corte", map: { en: "Cut" } },
    { plain: "Tinte", map: {} },
    { plain: "", map: { en: "Orphan English" } },
    { plain: null, map: { es: "Solo mapa", en: "Map only" } },
  ];
  assert.deepEqual(coverage(fields, "es", "en"), { translated: 2, total: 3 });
});

test("coverage of nothing is 0 of 0", () => {
  assert.deepEqual(coverage([], "es", "en"), { translated: 0, total: 0 });
});
