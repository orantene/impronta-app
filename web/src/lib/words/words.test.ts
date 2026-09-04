import test from "node:test";
import assert from "node:assert/strict";

import {
  INDUSTRY_PRESETS,
  INDUSTRY_PRESET_IDS,
  WORD_KEYS,
  WORD_LOCALES,
  WORD_ROWS,
  applyWordEdit,
  getWordRow,
  parseIndustryPresetId,
  parseWordOverrides,
  parseWordsSettings,
  presetRepresentsPeople,
  resolveWords,
  resolveWordsTable,
  wordsInputFromSettings,
} from "./index";
import { PAGE_DESIGNS } from "@/lib/site-admin/builder-node/page-designs";

// ─── Registry invariants ─────────────────────────────────────────────────
// These are the rules a feature manager adding their own rows has to keep.

test("every row has a value in every locale", () => {
  const missing: string[] = [];
  for (const row of WORD_ROWS) {
    for (const locale of WORD_LOCALES) {
      if (!row.fallback[locale]?.trim()) missing.push(`${row.key}.fallback.${locale}`);
      if (!row.where[locale]?.trim()) missing.push(`${row.key}.where.${locale}`);
    }
  }
  assert.deepEqual(missing, [], "every row needs en and es for both its label and its default");
});

test("row keys are unique", () => {
  assert.equal(new Set(WORD_KEYS).size, WORD_KEYS.length);
});

test("no row value uses an em dash", () => {
  // Customer-facing copy. The house rule is repo-wide; this is the local gate.
  const offenders: string[] = [];
  for (const row of WORD_ROWS) {
    for (const locale of WORD_LOCALES) {
      if (row.fallback[locale].includes("—")) offenders.push(`${row.key}.${locale}`);
    }
  }
  for (const preset of INDUSTRY_PRESETS) {
    for (const [key, text] of Object.entries(preset.words)) {
      for (const locale of WORD_LOCALES) {
        if (text[locale].includes("—")) offenders.push(`${preset.id}:${key}.${locale}`);
      }
    }
    for (const locale of WORD_LOCALES) {
      if (preset.chatVoice[locale].includes("—")) offenders.push(`${preset.id}:chatVoice.${locale}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("every preset override names a row that exists, in both locales", () => {
  const offenders: string[] = [];
  for (const preset of INDUSTRY_PRESETS) {
    for (const [key, text] of Object.entries(preset.words)) {
      if (!getWordRow(key)) offenders.push(`${preset.id}: unknown key ${key}`);
      for (const locale of WORD_LOCALES) {
        if (!text[locale]?.trim()) offenders.push(`${preset.id}:${key} missing ${locale}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("all nineteen presets exist and resolve", () => {
  assert.equal(INDUSTRY_PRESET_IDS.length, 19);
  assert.equal(INDUSTRY_PRESETS.length, 19);
  for (const id of INDUSTRY_PRESET_IDS) {
    assert.equal(parseIndustryPresetId(id), id);
  }
});

test("a preset's designId is a real PAGE_DESIGNS id or null", () => {
  // A preset may not point a brand-new workspace at a design that does not
  // exist. F1a additionally guarantees the design has no dead href.
  const ids = new Set(PAGE_DESIGNS.map((d) => d.id));
  const offenders = INDUSTRY_PRESETS.filter(
    (p) => p.designId !== null && !ids.has(p.designId),
  ).map((p) => `${p.id} -> ${p.designId}`);
  assert.deepEqual(offenders, []);
});

// ─── Preset parsing fails safe ───────────────────────────────────────────

test("an unrecognised preset degrades to custom, which renames nothing", () => {
  for (const raw of ["", "  ", "restaurante", null, undefined, 7, {}, []]) {
    assert.equal(parseIndustryPresetId(raw), "custom");
  }
  const words = resolveWords({ presetId: "who-knows" }, "en");
  assert.equal(words.word("reservations.place"), "Table");
  assert.equal(words.word("menu.item"), "Item");
});

test("preset ids are matched case- and whitespace-insensitively", () => {
  assert.equal(parseIndustryPresetId("  Restaurant "), "restaurant");
});

// ─── Resolution order ────────────────────────────────────────────────────

test("every preset resolves every row in both locales", () => {
  const blank: string[] = [];
  for (const preset of INDUSTRY_PRESETS) {
    for (const locale of WORD_LOCALES) {
      const words = resolveWords({ presetId: preset.id }, locale);
      for (const row of WORD_ROWS) {
        if (!words.word(row.key).trim()) blank.push(`${preset.id}:${row.key}.${locale}`);
      }
    }
  }
  assert.deepEqual(blank, []);
});

test("a preset renames the noun the industry actually uses", () => {
  const padel = resolveWords({ presetId: "sports_venue" }, "en");
  assert.equal(padel.word("reservations.place"), "Court");
  assert.equal(padel.word("reservations.party_size"), "Players");
  assert.equal(padel.word("reservations.cta"), "Book a court");

  const padelEs = resolveWords({ presetId: "sports_venue" }, "es");
  assert.equal(padelEs.word("reservations.place"), "Cancha");
  assert.equal(padelEs.word("reservations.party_size"), "Jugadores");

  const restaurant = resolveWords({ presetId: "restaurant" }, "es");
  assert.equal(restaurant.word("menu.item"), "Platillo");
  assert.equal(restaurant.word("menu.board"), "Cocina");
});

test("a tenant override beats the preset", () => {
  const words = resolveWords(
    {
      presetId: "sports_venue",
      overrides: { "reservations.place": { en: "Pitch", es: "Campo" } },
    },
    "en",
  );
  assert.equal(words.word("reservations.place"), "Pitch");
  assert.equal(words.sourceOf("reservations.place"), "override");
});

test("an override in one language leaves the other on its preset value", () => {
  const input = {
    presetId: "sports_venue",
    overrides: { "reservations.place": { en: "Pitch" } },
  };
  assert.equal(resolveWords(input, "en").word("reservations.place"), "Pitch");
  assert.equal(resolveWords(input, "es").word("reservations.place"), "Cancha");
});

test("a blank override is not a value; it falls through to the default", () => {
  const words = resolveWords(
    { presetId: "restaurant", overrides: { "menu.item": { en: "   " } } },
    "en",
  );
  assert.equal(words.word("menu.item"), "Dish");
  assert.equal(words.sourceOf("menu.item"), "preset");
});

// ─── The terminology contract (owned by Appointments, consumed here) ──────

test("an explicitly picked terminology moves the reservations rows", () => {
  const agenda = resolveWords({ terminologyId: "agenda" }, "es");
  assert.equal(agenda.word("reservations.feature"), "Citas");
  assert.equal(agenda.word("reservations.cta"), "Agendar");
  assert.equal(agenda.sourceOf("reservations.cta"), "terminology");
});

test("an explicit terminology pick outranks the preset", () => {
  // A barber who deliberately chose Agenda keeps it even under a preset that
  // would otherwise rename the feature.
  const words = resolveWords({ presetId: "sports_venue", terminologyId: "agenda" }, "en");
  assert.equal(words.word("reservations.feature"), "Appointments");
  // Rows the terminology setting does not own still come from the preset.
  assert.equal(words.word("reservations.place"), "Court");
});

test("an untouched terminology does not outrank the preset", () => {
  // "reservations" is what `parseTerminologyId` returns for absent and for
  // default alike, so it must not beat a preset the operator chose later.
  for (const raw of [undefined, null, "reservations"]) {
    const words = resolveWords({ presetId: "sports_venue", terminologyId: raw }, "en");
    assert.equal(words.word("reservations.feature"), "Bookings");
  }
});

test("terminology still supplies the default when no preset overrides it", () => {
  const words = resolveWords({}, "en");
  assert.equal(words.word("reservations.feature"), "Reservations");
  assert.equal(words.word("reservations.cta"), "Reserve");
});

// ─── The header verb can never be free text ──────────────────────────────

test("every preset's header verb renders a non-empty label, or is the custom escape", () => {
  for (const preset of INDUSTRY_PRESETS) {
    for (const locale of WORD_LOCALES) {
      const label = resolveWords({ presetId: preset.id }, locale).headerVerbLabel();
      if (preset.headerVerb === "custom") assert.equal(label, "");
      else assert.ok(label.trim().length > 0, `${preset.id} ${locale} header verb is blank`);
    }
  }
});

test("the header verb follows the words layer", () => {
  assert.equal(resolveWords({ presetId: "restaurant" }, "en").headerVerbLabel(), "Reserve");
  assert.equal(resolveWords({ presetId: "restaurant" }, "es").headerVerbLabel(), "Reservar");
  assert.equal(resolveWords({ presetId: "sports_venue" }, "en").headerVerbLabel(), "Book a court");
  assert.equal(resolveWords({ presetId: "bar_club" }, "es").headerVerbLabel(), "Entradas");
});

// ─── The signal that replaces a two-value workspace_type ──────────────────

test("only presets that represent people say so", () => {
  // This is what the starter roster seed should ask. `workspace_type` cannot
  // answer it: signup writes "talent" for a solo barber and a model agency
  // alike, which is why the barber gets three fabricated model profiles.
  assert.equal(presetRepresentsPeople("agency"), true);
  assert.equal(presetRepresentsPeople("salon_barber"), false);
  assert.equal(presetRepresentsPeople("restaurant"), false);
  assert.equal(presetRepresentsPeople("clinic"), false);
  // Unknown degrades to custom, which represents nobody, so a seed gated on
  // this can never invent profiles for a workspace we cannot classify.
  assert.equal(presetRepresentsPeople("who-knows"), false);
});

// ─── Settings parsing ────────────────────────────────────────────────────

test("override parsing drops unknown keys and malformed shapes", () => {
  const parsed = parseWordOverrides({
    "menu.item": { en: "Dish", es: "Platillo" },
    "not.a.row": { en: "Nope" },
    "menu.order": "a string, not an object",
    "menu.tab": { en: "   " },
    "menu.board": { en: 42 },
  });
  assert.deepEqual(Object.keys(parsed).sort(), ["menu.item"]);
});

test("override parsing survives every wrong shape JSONB can hold", () => {
  for (const raw of [null, undefined, 7, "words", [], [{ en: "x" }]]) {
    assert.deepEqual(parseWordOverrides(raw), {});
  }
});

test("a word is length-clamped so a paste cannot blow out a button", () => {
  const parsed = parseWordOverrides({ "menu.item": { en: "x".repeat(500) } });
  assert.equal(parsed["menu.item"]?.en?.length, 120);
});

test("settings parse reads preset and overrides off one raw object", () => {
  const parsed = parseWordsSettings({
    industry_preset: "restaurant",
    words: { "menu.item": { en: "Taco" } },
    appointments: { terminology: "agenda" },
  });
  assert.equal(parsed.presetId, "restaurant");
  assert.equal(parsed.overrides["menu.item"]?.en, "Taco");
});

test("wordsInputFromSettings carries the raw terminology through", () => {
  const input = wordsInputFromSettings({
    industry_preset: "salon_barber",
    appointments: { terminology: "agenda" },
  });
  assert.equal(input.terminologyId, "agenda");
  assert.equal(resolveWords(input, "es").word("reservations.cta"), "Agendar");
});

test("a corrupt settings blob degrades to the shipped words, never to blank", () => {
  for (const raw of [null, "nonsense", 3, []]) {
    const words = resolveWords(wordsInputFromSettings(raw), "en");
    assert.equal(words.word("menu.item"), "Item");
    assert.equal(words.word("reservations.cta"), "Reserve");
  }
});

// ─── Editing ─────────────────────────────────────────────────────────────

test("clearing a word removes the key rather than storing an empty string", () => {
  const one = applyWordEdit({}, "menu.item", "en", "Dish");
  assert.deepEqual(one, { "menu.item": { en: "Dish" } });

  const cleared = applyWordEdit(one, "menu.item", "en", "  ");
  assert.deepEqual(cleared, {}, "cleared and never-set must be the same stored state");
});

test("an edit does not mutate the map it was given", () => {
  const before = { "menu.item": { en: "Dish" } };
  applyWordEdit(before, "menu.item", "es", "Platillo");
  assert.deepEqual(before, { "menu.item": { en: "Dish" } });
});

test("an edit to an unknown row or locale is ignored", () => {
  assert.deepEqual(applyWordEdit({}, "not.a.row", "en", "Nope"), {});
  assert.deepEqual(applyWordEdit({}, "menu.item", "fr", "Plat"), {});
});

// ─── The settings table ──────────────────────────────────────────────────

test("the table returns every row with its provenance", () => {
  const table = resolveWordsTable(
    { presetId: "restaurant", overrides: { "menu.item": { en: "Taco" } } },
    "en",
  );
  assert.equal(table.length, WORD_ROWS.length);
  const byKey = new Map(table.map((entry) => [entry.row.key, entry]));
  assert.equal(byKey.get("menu.item")?.source, "override");
  assert.equal(byKey.get("menu.item")?.value, "Taco");
  assert.equal(byKey.get("menu.board")?.source, "preset");
  assert.equal(byKey.get("team.member")?.source, "default");
});

test("an unknown key resolves to itself rather than throwing", () => {
  const words = resolveWords({}, "en");
  assert.equal(words.word("not.a.row"), "not.a.row");
  assert.equal(words.sourceOf("not.a.row"), "default");
});
