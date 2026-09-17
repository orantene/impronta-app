import assert from "node:assert/strict";
import { test } from "node:test";

import { localeCandidates, resolveScheduleItemText, resolveScheduleItemTexts } from "./i18n";

const item = {
  title: "Opening set",
  subtitle: "Deep house · 90 min",
  description: null,
  i18n: { es: { title: "Set de apertura", subtitle: "  " }, fr: { title: "Set d'ouverture" } },
};

test("the overlay wins for its locale; the base column is the fallback", () => {
  assert.equal(resolveScheduleItemText(item, "title", "es"), "Set de apertura");
  assert.equal(resolveScheduleItemText(item, "title", "en"), "Opening set");
  assert.equal(resolveScheduleItemText(item, "title", "fr"), "Set d'ouverture");
  assert.equal(resolveScheduleItemText(item, "title", "de"), "Opening set");
});

test("a whitespace-only translation is absent, not blank", () => {
  assert.equal(resolveScheduleItemText(item, "subtitle", "es"), "Deep house · 90 min");
});

test("a missing base stays null instead of becoming an empty string", () => {
  assert.equal(resolveScheduleItemText(item, "description", "es"), null);
  assert.equal(resolveScheduleItemText({ ...item, title: "   " }, "title", "en"), null);
});

test("regional locales fall back to their base language, case-insensitively", () => {
  assert.deepEqual(localeCandidates("es-MX"), ["es-mx", "es"]);
  assert.deepEqual(localeCandidates("ES"), ["es"]);
  assert.deepEqual(localeCandidates(null), []);
  assert.equal(resolveScheduleItemText(item, "title", "es-MX"), "Set de apertura");
});

test("a corrupt overlay never throws and reads as no translation", () => {
  assert.equal(resolveScheduleItemText({ ...item, i18n: "nope" as unknown as null }, "title", "es"), "Opening set");
  assert.equal(resolveScheduleItemText({ ...item, i18n: { es: ["x"] } as unknown as null }, "title", "es"), "Opening set");
  assert.equal(resolveScheduleItemText({ ...item, i18n: null }, "title", "es"), "Opening set");
});

test("resolveScheduleItemTexts gives all three props", () => {
  assert.deepEqual(resolveScheduleItemTexts(item, "es"), {
    title: "Set de apertura",
    subtitle: "Deep house · 90 min",
    description: null,
  });
});
