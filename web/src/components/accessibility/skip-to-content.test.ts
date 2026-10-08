import test from "node:test";
import assert from "node:assert/strict";

import { skipToContentLabel } from "./skip-to-content";

// Catches: the talent site's skip link reading English on a Spanish page.
test("skip link follows the site locale", () => {
  assert.equal(skipToContentLabel("es"), "Saltar al contenido");
  assert.equal(skipToContentLabel("es-MX"), "Saltar al contenido");
  assert.equal(skipToContentLabel("ES"), "Saltar al contenido");
  assert.equal(skipToContentLabel("en"), "Skip to content");
  assert.equal(skipToContentLabel("en-US"), "Skip to content");
  assert.equal(skipToContentLabel(undefined), "Skip to content");
  assert.equal(skipToContentLabel(null), "Skip to content");
  assert.equal(skipToContentLabel(""), "Skip to content");
});
