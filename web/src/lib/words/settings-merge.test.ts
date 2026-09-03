import test from "node:test";
import assert from "node:assert/strict";

import {
  applyWordEdit,
  parseWordsSettings,
  resolveWords,
  wordsInputFromSettings,
} from "./index";

/**
 * The merge rules `industry-settings.ts` depends on.
 *
 * The action itself is a `"use server"` module and needs a session, so it
 * cannot run in a node test lane. What CAN be asserted here is the shape of
 * every write it performs — and the shape is where the damage would be, because
 * `agencies.settings` is ONE JSONB blob shared with `appointments` and whatever
 * lands next. A write that clobbers a sibling key is silent, permanent, and
 * only noticed when another feature stops working.
 */

/** Exactly what `setIndustryPreset` writes. */
function writePreset(
  settings: Record<string, unknown>,
  presetId: string,
): Record<string, unknown> {
  return { ...settings, industry_preset: presetId };
}

/** Exactly what `setWordOverride` writes. */
function writeWord(
  settings: Record<string, unknown>,
  key: string,
  locale: "en" | "es",
  value: string,
): Record<string, unknown> {
  const parsed = parseWordsSettings(settings);
  return { ...settings, words: applyWordEdit(parsed.overrides, key, locale, value) };
}

const REAL_SETTINGS: Record<string, unknown> = {
  appointments: {
    enabled: true,
    terminology: "agenda",
    timezone: "America/Cancun",
    defaults: { slotMinutes: 30 },
  },
  some_other_feature: { keep: "me" },
};

test("choosing an industry does not clobber the appointments block", () => {
  // The failure this prevents: a preset write that sets the whole column would
  // silently delete another manager's config, and nothing would go red.
  const next = writePreset(REAL_SETTINGS, "salon_barber");
  assert.deepEqual(next.appointments, REAL_SETTINGS.appointments);
  assert.deepEqual(next.some_other_feature, { keep: "me" });
  assert.equal(next.industry_preset, "salon_barber");
});

test("renaming a word does not clobber the preset or the appointments block", () => {
  const withPreset = writePreset(REAL_SETTINGS, "restaurant");
  const next = writeWord(withPreset, "menu.item", "es", "Platillo");
  assert.equal(next.industry_preset, "restaurant");
  assert.deepEqual(next.appointments, REAL_SETTINGS.appointments);
  assert.equal(
    (next.words as Record<string, Record<string, string>>)["menu.item"]?.es,
    "Platillo",
  );
});

test("a terminology the operator chose survives an industry change", () => {
  // Terminology belongs to Appointments and lives in their block. A preset
  // change must never rewrite it — a barber who deliberately picked Agenda
  // keeps it, and `resolveWords` still lets that explicit pick beat the preset.
  const next = writePreset(REAL_SETTINGS, "sports_venue");
  const words = resolveWords(wordsInputFromSettings(next), "en");
  assert.equal(
    (next.appointments as Record<string, unknown>).terminology,
    "agenda",
    "the preset write must not touch terminology",
  );
  assert.equal(words.word("reservations.feature"), "Appointments");
  // And the preset still renames the rows terminology does not own.
  assert.equal(words.word("reservations.place"), "Court");
});

test("switching industry keeps the operator's own renamed words", () => {
  // They meant both things. Dropping their edits because a preset changed
  // would be the seeder rewriting an operator's work, which is exactly what
  // the nav seeder refuses to do.
  const edited = writeWord(writePreset({}, "restaurant"), "menu.item", "en", "Taco");
  const switched = writePreset(edited, "bar_club");
  const words = resolveWords(wordsInputFromSettings(switched), "en");
  assert.equal(words.word("menu.item"), "Taco");
  assert.equal(words.sourceOf("menu.item"), "override");
});

test("clearing a word returns the row to the preset default", () => {
  const edited = writeWord(writePreset({}, "restaurant"), "menu.item", "en", "Taco");
  const cleared = writeWord(edited, "menu.item", "en", "   ");
  const words = resolveWords(wordsInputFromSettings(cleared), "en");
  assert.equal(words.word("menu.item"), "Dish");
  assert.equal(words.sourceOf("menu.item"), "preset");
  // Cleared and never-set must be the same STORED state, or the settings table
  // drifts from what the public page renders.
  assert.deepEqual((cleared.words as Record<string, unknown>)["menu.item"], undefined);
});

test("the round trip a settings screen performs is stable", () => {
  // pick industry -> rename -> re-read -> the page renders what was chosen.
  let settings: Record<string, unknown> = {};
  settings = writePreset(settings, "sports_venue");
  settings = writeWord(settings, "reservations.place", "es", "Pista");

  const en = resolveWords(wordsInputFromSettings(settings), "en");
  const es = resolveWords(wordsInputFromSettings(settings), "es");
  assert.equal(en.word("reservations.place"), "Court", "untouched locale keeps the preset");
  assert.equal(es.word("reservations.place"), "Pista", "the edited locale wins");
  assert.equal(en.headerVerbLabel(), "Book a court");
});

test("an unknown preset id cannot be stored by this shape", () => {
  // The action validates with z.enum(INDUSTRY_PRESET_IDS) before writing, and
  // the read path fails toward "custom" regardless, so a bad value can never
  // rename a live workspace's nouns.
  const words = resolveWords(wordsInputFromSettings({ industry_preset: "nonsense" }), "en");
  assert.equal(words.preset.id, "custom");
  assert.equal(words.word("menu.item"), "Item");
});
