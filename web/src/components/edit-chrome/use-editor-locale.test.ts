import test from "node:test";
import assert from "node:assert/strict";

import { resolveEditorLocale } from "./use-editor-locale";

test("TUL-459: server request locale wins; a missing or disagreeing cookie never flips publish chrome", () => {
  // Cookie cleared at sign-in: server es stays es (Publish drawer stays Spanish).
  assert.equal(resolveEditorLocale("es", null), "es");
  // Cookie disagrees with the server locale: server wins across re-renders.
  assert.equal(resolveEditorLocale("es", "en"), "es");
  assert.equal(resolveEditorLocale("en", "es"), "en");
  // No provider: the cookie is the only source, else the fallback.
  assert.equal(resolveEditorLocale(null, "es"), "es");
  assert.equal(resolveEditorLocale(undefined, null, "en"), "en");
  assert.equal(resolveEditorLocale("  ", "es", "en"), "es");
  assert.equal(resolveEditorLocale("fr", "en", "es"), "en");
});
