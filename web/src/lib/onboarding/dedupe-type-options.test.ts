import assert from "node:assert/strict";
import test from "node:test";

import { dedupeTypeOptionsByLabel } from "./dedupe-type-options";

const o = (id: string, en: string, es: string) => ({ id, label: { en, es } });

test("two terms with the same Spanish label list once in Spanish, twice-distinct in English", () => {
  const list = [o("a", "Hair Stylist", "Estilista"), o("b", "Stylist", "Estilista"), o("c", "Barber", "Barbero")];
  assert.deepEqual(dedupeTypeOptionsByLabel(list, "es").map((x) => x.id), ["a", "c"]);
  assert.deepEqual(dedupeTypeOptionsByLabel(list, "en").map((x) => x.id), ["a", "b", "c"]);
});

test("case and accents do not defeat the dedupe", () => {
  const list = [o("a", "Make-up", "Maquillaje"), o("b", "Makeup", "maquillaje")];
  assert.equal(dedupeTypeOptionsByLabel(list, "es").length, 1);
});
