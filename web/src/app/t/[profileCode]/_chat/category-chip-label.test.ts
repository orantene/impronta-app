import assert from "node:assert/strict";
import { test } from "node:test";

import { categoryChipLabel, uniqueCategoryChips } from "./category-chip-label";

test("Jorgelina's stored names stay names, and slugs are spelled out", () => {
  assert.deepEqual(
    uniqueCategoryChips(["Uñas", "Pestañas", "Cejas", "Depilación", "Uñas"]),
    ["Uñas", "Pestañas", "Cejas", "Depilación"],
  );
  assert.equal(categoryChipLabel("unas"), "Uñas");
  assert.equal(categoryChipLabel("pestanas"), "Pestañas");
  assert.equal(categoryChipLabel("cejas"), "Cejas");
  assert.equal(categoryChipLabel("depilacion"), "Depilación");
  assert.equal(categoryChipLabel("Cena"), "Cena");
});
