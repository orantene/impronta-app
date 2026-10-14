import assert from "node:assert/strict";
import test from "node:test";

import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

import { designLooksForCategory } from "./finish-url";

test("TUL-568: beauty keeps the rose / blush / orchid looks", () => {
  assert.deepEqual(designLooksForCategory("nail technician"), ["rose", "blush", "orchid"]);
  assert.deepEqual(designLooksForCategory("uñas"), ["rose", "blush", "orchid"]);
});

test("TUL-568: a cleaning business is offered no beauty look", () => {
  for (const q of ["house cleaning", "limpieza de casas", "cleaning"]) {
    const looks = designLooksForCategory(q);
    assert.ok(looks.length >= 2, q);
    for (const k of looks) assert.ok(!["rose", "blush", "orchid"].includes(k), `${q}: ${k}`);
  }
});

test("TUL-568: every offered look exists in the Maison v2 palettes", () => {
  const keys = new Set((getGalleryDesign("maison-v2")?.palettes ?? []).map((p) => p.key));
  for (const q of ["nails", "house cleaning", null, ""]) for (const k of designLooksForCategory(q)) assert.ok(keys.has(k), k);
});
