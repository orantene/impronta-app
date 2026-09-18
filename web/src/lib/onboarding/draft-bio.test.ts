import test from "node:test";
import assert from "node:assert/strict";
import { bioPassesRules, draftBio } from "./draft-bio";

test("Rosa's bio: first person, her words only, passes the floor, no invented claims", () => {
  const facts = { name: "Rosa", discipline: "House cleaner", city: "Playa del Carmen", services: ["House cleaning", "Deep cleaning"], yearsExperience: null };
  const en = draftBio(facts, "en");
  assert.equal(en, "I'm Rosa, a house cleaner in Playa del Carmen. I offer house cleaning and deep cleaning. Write to me and we'll sort out what you need.");
  assert.deepEqual(bioPassesRules(en, facts), { ok: true });
  const es = draftBio(facts, "es");
  assert.ok(es.startsWith("Soy Rosa, house cleaner en Playa del Carmen."));
  assert.ok(es.length >= 30);
});

test("catalogue labels read as trades: an event photographer, a DJ, an AC technician", () => {
  const base = { name: "Diego", city: "Tulum", services: [], yearsExperience: null };
  assert.ok(draftBio({ ...base, discipline: "Event Photographer" }, "en").startsWith("I'm Diego, an event photographer in Tulum."));
  assert.ok(draftBio({ ...base, discipline: "DJ" }, "en").startsWith("I'm Diego, a DJ in Tulum."));
  assert.ok(draftBio({ ...base, discipline: "AC Technician" }, "en").startsWith("I'm Diego, an AC technician in Tulum."));
  assert.ok(draftBio({ ...base, discipline: "Yoga Instructor" }, "en").startsWith("I'm Diego, a yoga instructor in Tulum."));
  assert.ok(draftBio({ ...base, discipline: "Fotógrafo de Eventos" }, "es").startsWith("Soy Diego, fotógrafo de eventos en Tulum."));
});

test("rules refuse invented years, awards, clients and em dashes", () => {
  const facts = { name: null, discipline: null, city: null, services: [], yearsExperience: null };
  assert.equal(bioPassesRules("With 10 years of experience I do great work for you.", facts).reason, "invented_claim");
  assert.equal(bioPassesRules("Award-winning stylist ready to help you shine today.", facts).reason, "invented_claim");
  assert.equal(bioPassesRules("Short.", facts).reason, "too_short");
  assert.equal(bioPassesRules("A fine bio — with a dash, long enough to pass the floor.", facts).reason, "em_dash");
  assert.equal(bioPassesRules("With 10 years of experience I do great work for you.", { ...facts, yearsExperience: 10 }).ok, true);
});

test("nothing known still yields a usable line", () => {
  const facts = { name: null, discipline: null, city: null, services: [], yearsExperience: null };
  const en = draftBio(facts, "en");
  assert.ok(en.length >= 30);
  assert.equal(bioPassesRules(en, facts).ok, true);
});
