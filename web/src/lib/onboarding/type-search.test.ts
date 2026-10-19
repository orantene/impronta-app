import test from "node:test";
import assert from "node:assert/strict";
import { rankTalentTypeOptions, typedCategoryOption } from "./type-search";
import type { TalentTypeTerm } from "./type-chip";

const t = (id: string, slug: string, en: string, es: string, synonyms: string[] = []): TalentTypeTerm => ({ id, slug, name: { en, es }, aliases: [], synonyms });
const TERMS: TalentTypeTerm[] = [
  t("1", "dental-hygienist", "Dental hygienist", "Higienista dental", ["limpieza dental"]),
  t("2", "house-manager", "House Manager", "Gerente de Casa"),
  t("3", "cleaner", "Cleaner", "Limpiador"),
  t("4", "housekeeper", "Housekeeper", "Ama de Llaves", ["maid"]),
  t("5", "villa-cleaner", "Villa Cleaner", "Limpieza de Villa"),
  t("6", "nail-artist", "Nail Artist", "Manicurista", ["manicure"]),
];
const first = (q: string) => rankTalentTypeOptions(TERMS, q, "es")[0]?.label.es;
const slugs = (q: string) => rankTalentTypeOptions(TERMS, q, "es").map((o) => o.slug);

test("limpieza -> Limpieza de casas first", () => {
  assert.equal(first("limpieza"), "Limpieza de casas");
  assert.ok(slugs("limpieza").indexOf("cleaner") < slugs("limpieza").indexOf("dental-hygienist"));
});
test("casa -> Limpieza de casas before Gerente de Casa", () => {
  assert.equal(first("casa"), "Limpieza de casas");
  assert.ok(slugs("casa").indexOf("cleaner") < slugs("casa").indexOf("house-manager"));
});
test("accents and case are folded", () => {
  assert.equal(first("limpiéza"), "Limpieza de casas");
  assert.equal(first("LIMPIEZA"), "Limpieza de casas");
  assert.equal(first("Limpieza de casás"), "Limpieza de casas");
});
test("synonyms: aseo, limpiadora, housekeeping", () => {
  assert.equal(first("aseo"), "Limpieza de casas");
  assert.equal(first("limpiadora"), "Limpieza de casas");
  assert.equal(first("housekeeping"), "Limpieza de casas");
});
test("other trades are unaffected", () => {
  assert.equal(first("manicure"), "Manicurista");
  assert.equal(first("higienista"), "Higienista dental");
});
// TUL-1127 / TUL-1161: everyday words find the talent trade (the /start talent picker), not only the business catalogue.
const TRADES: TalentTypeTerm[] = [
  t("11", "hair-stylist", "Hair Stylist", "Estilista"),
  t("12", "lash-artist", "Lash Artist", "Lashista"),
  t("13", "dentist", "Dentist", "Dentista"),
  t("14", "nail-artist", "Nail Artist", "Manicurista"),
  t("15", "barber", "Barber", "Barbero"),
  t("16", "cleaner", "Cleaner", "Limpiador"),
];
const firstSlug = (q: string) => rankTalentTypeOptions(TRADES, q, "es")[0]?.slug;
for (const [word, slug] of [
  ["corte de pelo", "hair-stylist"],
  ["Corte de cabello", "hair-stylist"],
  ["haircut", "hair-stylist"],
  ["peluquera", "hair-stylist"],
  ["lashes", "lash-artist"],
  ["pestañas", "lash-artist"],
  ["dentista", "dentist"],
  ["clínica dental", "dentist"],
  ["uñas", "nail-artist"],
  ["casa", "cleaner"],
  ["cleaning", "cleaner"],
  ["house", "cleaner"],
] as const) {
  test(`everyday word "${word}" finds ${slug}`, () => {
    assert.ok(slugsOf(word).includes(slug), `expected ${slug} in [${slugsOf(word).join(", ")}]`);
  });
}
function slugsOf(q: string): string[] {
  return rankTalentTypeOptions(TRADES, q, "es").map((o) => o.slug);
}
test("a long everyday phrase falls back to its significant words instead of zero hits", () => {
  assert.ok(slugsOf("necesito un haircut para mañana").includes("hair-stylist"));
  assert.ok(firstSlug("necesito un haircut para mañana"));
  assert.deepEqual(rankTalentTypeOptions(TRADES, "zzzz qqqq", "es"), []);
});
test("empty text lists the default list", () => {
  assert.equal(rankTalentTypeOptions(TERMS, "", "es").length, TERMS.length);
});
test("typed fallback exists for any non-empty text, never for blank", () => {
  assert.deepEqual(typedCategoryOption("  Limpio casas "), { id: "", slug: "", label: { en: "Limpio casas", es: "Limpio casas" } });
  assert.equal(typedCategoryOption("a")?.id, "");
  assert.equal(typedCategoryOption("   "), null);
});
