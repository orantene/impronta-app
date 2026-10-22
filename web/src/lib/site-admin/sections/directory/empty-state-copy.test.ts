import assert from "node:assert/strict";
import test from "node:test";

import { emptyStateCopy } from "./empty-state-copy";

const ES = "Aún no hay talento que coincida con estos filtros.";

test("the built-in English preset reads in Spanish on an ES page", () => {
  assert.equal(emptyStateCopy("No one matches yet. Broaden the filters, or check back as the roster grows.", "es", ES), ES);
  assert.equal(emptyStateCopy("No one matches yet, check back as the roster grows.", "es", ES), ES);
  assert.equal(emptyStateCopy("", "es", ES), ES);
  assert.equal(emptyStateCopy(undefined, "es", ES), ES);
});

test("English pages keep the authored English text", () => {
  const t = "No one matches yet. Broaden the filters, or check back as the roster grows.";
  assert.equal(emptyStateCopy(t, "en", ES), t);
});

test("the owner's own text always wins, in any language", () => {
  assert.equal(emptyStateCopy("Pronto más gente", "es", ES), "Pronto más gente");
  assert.equal(emptyStateCopy("Coming soon", "es", ES), "Coming soon");
});
