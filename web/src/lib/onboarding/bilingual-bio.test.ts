import test from "node:test";
import assert from "node:assert/strict";
import { bioPassesRules, draftBio } from "./draft-bio";
import { planBios, secondaryLocalesFromBioEntries } from "./bilingual-bio";

const rosa = { name: "Rosa", discipline: "House cleaner", city: "Playa del Carmen", services: ["House cleaning", "Deep cleaning"], yearsExperience: null };

test("an English flow writes both languages and the base is English", () => {
  const plan = planBios(rosa, "en");
  assert.deepEqual(plan.entries.map((e) => e.locale), ["en", "es"]);
  assert.equal(plan.base?.locale, "en");
  assert.ok(plan.base?.text.startsWith("I'm Rosa"));
  assert.ok(plan.entries[1].text.startsWith("Soy Rosa"));
});

test("a Spanish flow writes both languages and the base is Spanish (the flow language)", () => {
  const plan = planBios(rosa, "es");
  assert.deepEqual(plan.entries.map((e) => e.locale), ["es", "en"]);
  assert.equal(plan.base?.locale, "es");
  assert.ok(plan.base?.text.startsWith("Soy Rosa"));
});

test("a draft that breaks the rules is not written; the base falls back to the one that passed", () => {
  // Same facts, two templates: the English one is longer, so a name can push only English over the 600-character cap.
  const bare = { discipline: null, city: null, services: [] as string[], yearsExperience: null };
  let name = "x";
  while (draftBio({ ...bare, name }, "en").length <= 600) name += "x";
  const facts = { ...bare, name };
  assert.equal(bioPassesRules(draftBio(facts, "en"), facts).ok, false);
  assert.equal(bioPassesRules(draftBio(facts, "es"), facts).ok, true);
  const plan = planBios(facts, "en");
  assert.deepEqual(plan.entries.map((e) => e.locale), ["es"]);
  assert.equal(plan.base?.locale, "es");
});

test("when no draft passes nothing is written and there is no base", () => {
  assert.deepEqual(planBios({ name: "x".repeat(700), discipline: null, city: null, services: [], yearsExperience: null }, "en"), { entries: [], base: null });
  // An em dash in the person's own name fails every language.
  assert.equal(planBios({ name: "Rosa — Cleaning", discipline: null, city: null, services: [], yearsExperience: null }, "es").base, null);
});

test("an unnamed, trade-less brief still passes in both languages (the floor is 30 characters)", () => {
  const bare = { name: null, discipline: null, city: null, services: [], yearsExperience: null };
  const plan = planBios(bare, "es");
  assert.equal(plan.entries.length, 2);
  assert.equal(plan.base?.locale, "es");
});

test("TUL-442: a Spanish bilingual plan enables en (not es) as secondary", () => {
  const plan = planBios(rosa, "es");
  assert.deepEqual(secondaryLocalesFromBioEntries(plan.entries, "es"), ["en"]);
});

test("TUL-442: when only the primary draft passes, secondary stays empty", () => {
  assert.deepEqual(
    secondaryLocalesFromBioEntries([{ locale: "es", text: "Soy Rosa, limpio casas en Playa del Carmen." }], "es"),
    [],
  );
});
