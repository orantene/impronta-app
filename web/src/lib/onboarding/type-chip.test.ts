import test from "node:test";
import assert from "node:assert/strict";
import { proposeBusinessType, proposeTalentType, queryWords, type TalentTypeTerm } from "./type-chip";

const TERMS: TalentTypeTerm[] = [
  { id: "1", slug: "cleaner", name: { en: "Cleaner", es: "Limpiador" }, aliases: [], synonyms: [] },
  { id: "2", slug: "deep-cleaning-specialist", name: { en: "Deep Cleaning Specialist", es: "Especialista en limpieza profunda" }, aliases: [], synonyms: [] },
  { id: "3", slug: "nail-artist", name: { en: "Nail Artist", es: "Manicurista" }, aliases: ["nail tech"], synonyms: ["manicure"] },
  { id: "4", slug: "dj", name: { en: "DJ", es: "DJ" }, aliases: [], synonyms: [] },
  // Six "technician" trades: the shared word must not outvote the trade word.
  { id: "5", slug: "ac-technician", name: { en: "AC Technician", es: "Técnico de A/C" }, aliases: [], synonyms: [] },
  { id: "6", slug: "pool-technician", name: { en: "Pool Technician", es: "Técnico(a) de Piscina" }, aliases: [], synonyms: [] },
  { id: "7", slug: "sound-technician", name: { en: "Sound Technician", es: "Técnico de Sonido" }, aliases: [], synonyms: [] },
  { id: "8", slug: "lighting-technician", name: { en: "Lighting Technician", es: "Técnico de Iluminación" }, aliases: [], synonyms: [] },
  { id: "9", slug: "wifi-technician", name: { en: "Wi-Fi Technician", es: "Técnico Wi-Fi" }, aliases: [], synonyms: [] },
  { id: "10", slug: "av-technician", name: { en: "Audio/Visual Technician", es: "Técnico AV" }, aliases: [], synonyms: [] },
];

test("talent chip: 'nail technician' is Nail Artist, not the alphabetically first technician (p12 real-model run)", () => {
  const p = proposeTalentType("nail technician", TERMS);
  assert.equal(p.proposed?.slug, "nail-artist");
  assert.equal(proposeTalentType("pool technician", TERMS).proposed?.slug, "pool-technician");
  assert.equal(proposeTalentType("técnico de piscina", TERMS).proposed?.slug, "pool-technician");
});

test("talent chip: the trade word beats a synonym hit and a lone generic head word", () => {
  const terms: TalentTypeTerm[] = [
    ...TERMS,
    { id: "11", slug: "event-photographer", name: { en: "Event Photographer", es: "Fotógrafo de Eventos" }, aliases: [], synonyms: [] },
    { id: "12", slug: "drone-photographer", name: { en: "Drone Photographer", es: "Fotógrafo con Dron" }, aliases: [], synonyms: [] },
    { id: "13", slug: "wedding-host", name: { en: "Wedding Host", es: "Maestro de Ceremonias" }, aliases: [], synonyms: [] },
    { id: "14", slug: "language-teacher", name: { en: "Language Teacher", es: "Profesor de Idiomas" }, aliases: [], synonyms: [] },
    { id: "15", slug: "yoga-instructor", name: { en: "Yoga Instructor", es: "Instructor de Yoga" }, aliases: [], synonyms: [] },
    { id: "16", slug: "breathwork-instructor", name: { en: "Breathwork Instructor", es: "Instructor de Respiración" }, aliases: [], synonyms: [] },
  ];
  const dj = terms.find((t) => t.slug === "dj")!;
  dj.synonyms = ["wedding dj", "event dj", "party dj"];
  assert.equal(proposeTalentType("Wedding and event photographer", terms).proposed?.slug, "event-photographer");
  assert.equal(proposeTalentType("yoga and breathwork teacher", terms).proposed?.slug, "yoga-instructor");
  assert.equal(proposeTalentType("yoga instructor", terms).proposed?.slug, "yoga-instructor");
});

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
  // p12 real-model run: "food service" landed on "Dry cleaning service".
  assert.equal(proposeBusinessType("food service").proposed?.id, "restaurant");
  assert.equal(proposeBusinessType("food service Taquería El Güero").proposed?.id, "restaurant");
  assert.equal(proposeBusinessType("barbershop Barbería Norte").proposed?.family, "beauty");
  assert.equal(proposeBusinessType("spa Casa Selva Spa").proposed?.family, "wellness");
  assert.deepEqual(queryWords("the Argentine grill of Cancún"), ["argentine", "cancun", "grill"]);
});
