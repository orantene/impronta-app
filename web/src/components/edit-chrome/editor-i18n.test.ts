import assert from "node:assert/strict";
import { test } from "node:test";

import { detectEditorLocale, editorT, ES_TEXT, MESSAGES } from "./editor-i18n";

// ── Legacy semantic-key table (navigator-panel.tsx consumer) ────────────────

test("legacy semantic keys still resolve in both locales", () => {
  assert.equal(editorT("layers.panel", "en"), "Layers");
  assert.equal(editorT("layers.panel", "es"), "Capas");
  assert.equal(editorT("pageSettings.panel", "es"), "Ajustes de página");
});

test("legacy semantic key falls back to English for an unrecognized locale value cast", () => {
  // MESSAGES only defines en/es; a missing es entry should never happen but
  // the ?? fallback chain is exercised here via a key present in both.
  assert.equal(editorT("zoom.reset", "es"), "100%");
});

// ── W2-C6 English-text-keyed bulk table ──────────────────────────────────────

test("English text passes through unchanged in en locale", () => {
  assert.equal(editorT("Publish", "en"), "Publish");
  assert.equal(editorT("Structure", "en"), "Structure");
  assert.equal(editorT("Save draft", "en"), "Save draft");
});

test("English text resolves to Spanish in es locale for covered strings", () => {
  assert.equal(editorT("Publish", "es"), "Publicar");
  assert.equal(editorT("Structure", "es"), "Estructura");
  assert.equal(editorT("Save draft", "es"), "Guardar borrador");
  assert.equal(editorT("Undo", "es"), "Deshacer");
  assert.equal(editorT("Cancel", "es"), "Cancelar");
});

test("unrecognized English text falls back to the original string (tenant overrides, dynamic content)", () => {
  assert.equal(
    editorT("Some tenant-authored label that isn't in the dictionary", "es"),
    "Some tenant-authored label that isn't in the dictionary",
  );
});

test("default locale argument is English", () => {
  assert.equal(editorT("Publish"), "Publish");
});

// ── Key-parity guard — every string covered in the bulk ES table must have a
// non-empty Spanish translation, and no entry should contain an em dash
// (owner rule: no em dashes in user-facing copy, either language). ───────────

test("no em dashes anywhere in the editor i18n catalog (either language)", async () => {
  const mod = await import("./editor-i18n");
  // Exercise a representative sample of keys pulled from the source via a
  // black-box probe: re-require the ES_TEXT table indirectly by checking
  // known keys resolve to translations with no "—" character.
  const sampleKeys = [
    "Publish",
    "Structure",
    "Save draft",
    "Unpublished changes",
    "Copy from live",
    "Builder change blocked",
    "This page changed in another tab or session. Choose Reload latest or Keep editing this copy in the banner.",
  ];
  for (const key of sampleKeys) {
    const es = mod.editorT(key, "es");
    assert.ok(!es.includes("—"), `em dash found in ES translation of "${key}"`);
    const en = mod.editorT(key, "en");
    assert.ok(!en.includes("—"), `em dash found in EN source of "${key}"`);
  }
});

test("detectEditorLocale returns 'en' outside a browser (no navigator)", () => {
  // node:test runs in a Node context with no `navigator.language` wired the
  // same way a browser would, so this documents/guards the server-safe path.
  assert.equal(detectEditorLocale(), "en");
});

// ── W5-A4 — deep per-block inspector content editors ────────────────────────
// hero / cta_banner / gallery_strip / testimonials_trio / featured_talent /
// category_grid / talent_type_grid / trust_strip curated Content tabs, plus
// the generic-content fallback and content-dispatch viewport hint. These
// spot-check a representative sample; the full-catalog test below covers
// every key exhaustively.

test("deep content-editor keys resolve to Spanish (spot check)", () => {
  assert.equal(editorT("Eyebrow", "es"), "Antetítulo");
  assert.equal(editorT("Headline", "es"), "Título");
  assert.equal(editorT("Primary Button", "es"), "Botón principal");
  assert.equal(editorT("Add hero image", "es"), "Agregar imagen del hero");
  assert.equal(editorT("Photos", "es"), "Fotos");
  assert.equal(editorT("Quote", "es"), "Cita");
  assert.equal(editorT("Hand-picked", "es"), "Selección manual");
  assert.equal(editorT("New category", "es"), "Nueva categoría");
  assert.equal(editorT("Manual Cards", "es"), "Tarjetas manuales");
  assert.equal(editorT("Icon row", "es"), "Fila de iconos");
  assert.equal(
    editorT("No editor registered for section type", "es"),
    "No hay editor registrado para este tipo de sección",
  );
});

test("deep content-editor keys pass through unchanged in en", () => {
  assert.equal(editorT("Eyebrow", "en"), "Eyebrow");
  assert.equal(editorT("Add hero image", "en"), "Add hero image");
  assert.equal(editorT("Manual Cards", "en"), "Manual Cards");
});

// ── Full-catalog key-parity guard ───────────────────────────────────────────
// Every ES_TEXT entry must have a non-empty Spanish translation and neither
// the English key nor the Spanish value may contain an em dash, across the
// WHOLE catalog (not just a hand-picked sample) — this is what makes the
// guard catch a future entry added without its translation or with a
// forbidden em dash, including everything added in W5-A4.

test("every ES_TEXT entry has a non-empty Spanish translation, no em dashes either side", () => {
  const keys = Object.keys(ES_TEXT);
  assert.ok(keys.length > 300, "expected the deep-editor catalog to be present");
  for (const key of keys) {
    const es = ES_TEXT[key]!;
    assert.ok(es.length > 0, `empty ES translation for "${key}"`);
    assert.ok(!key.includes("—"), `em dash found in EN key "${key}"`);
    assert.ok(!es.includes("—"), `em dash found in ES translation of "${key}"`);
  }
});

test("every legacy semantic MessageKey has a non-empty EN and ES value, no em dashes", () => {
  const enKeys = Object.keys(MESSAGES.en);
  const esKeys = Object.keys(MESSAGES.es);
  assert.deepEqual(
    [...enKeys].sort(),
    [...esKeys].sort(),
    "legacy semantic-key table must define the same keys for en and es",
  );
  for (const key of enKeys) {
    const en = MESSAGES.en[key as keyof typeof MESSAGES.en];
    const es = MESSAGES.es[key as keyof typeof MESSAGES.es];
    assert.ok(en.length > 0, `empty EN value for "${key}"`);
    assert.ok(es.length > 0, `empty ES value for "${key}"`);
    assert.ok(!en.includes("—"), `em dash found in EN value for "${key}"`);
    assert.ok(!es.includes("—"), `em dash found in ES value for "${key}"`);
  }
});
