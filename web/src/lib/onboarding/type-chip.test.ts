import test from "node:test";
import assert from "node:assert/strict";
import { proposeBusinessType, proposeTalentType, queryWords, type TalentTypeTerm } from "./type-chip";

const TERMS: TalentTypeTerm[] = [
  { id: "1", slug: "cleaner", name: { en: "Cleaner", es: "Limpiador" }, aliases: [], synonyms: [] },
  { id: "2", slug: "deep-cleaning-specialist", name: { en: "Deep Cleaning Specialist", es: "Especialista en limpieza profunda" }, aliases: [], synonyms: [] },
  { id: "3", slug: "nail-artist", name: { en: "Nail Artist", es: "Manicurista" }, aliases: ["nail tech"], synonyms: ["manicure"] },
  { id: "4", slug: "dj", name: { en: "DJ", es: "DJ" }, aliases: [], synonyms: [] },
];

test("talent chip: house cleaner → cleaner first, deep cleaning as an alternative", () => {
  const p = proposeTalentType("House cleaner", TERMS);
  assert.equal(p.proposed?.slug, "cleaner");
  assert.ok(p.alternatives.some((a) => a.slug === "deep-cleaning-specialist"));
});

test("talent chip: nail artist by name, manicurista by ES, nail tech by alias", () => {
  assert.equal(proposeTalentType("Nail artist", TERMS).proposed?.slug, "nail-artist");
  assert.equal(proposeTalentType("manicurista", TERMS).proposed?.slug, "nail-artist");
  assert.equal(proposeTalentType("nail tech", TERMS).proposed?.slug, "nail-artist");
  assert.equal(proposeTalentType("astronaut", TERMS).proposed, null);
});

test("business chip: whole phrase then words; restaurant family for a grill", () => {
  const p = proposeBusinessType("Argentine grill restaurant");
  assert.ok(p.proposed, "a restaurant type is found");
  assert.equal(p.proposed?.family, "dining");
  const n = proposeBusinessType("Nail salon");
  assert.equal(n.proposed?.family, "beauty");
  assert.deepEqual(queryWords("the Argentine grill of Cancún"), ["argentine", "cancun", "grill"]);
});
