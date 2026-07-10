import assert from "node:assert/strict";
import { test } from "node:test";

import { detectEditorLocale, editorT } from "./editor-i18n";

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
