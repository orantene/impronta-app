/**
 * F33: the review / resume line names the APPLIED design and look.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { designSummaryLine } from "./maison-summary-line";

test("Maison v2 with a null saved look reads its own name and default palette", () => {
  const line = designSummaryLine({
    designSlug: "maison-v2",
    lookSlug: null,
    paletteKey: "pink",
    customPalette: null,
    tail: "Your content",
    locale: "en",
  });
  assert.equal(line, "Maison v2 · Rosé · Your content");
});

test("a gallery design's saved look key names that palette; a Maison palette key never leaks", () => {
  assert.equal(
    designSummaryLine({ designSlug: "maison-v2", lookSlug: "sage", paletteKey: "pink", customPalette: null, tail: "x", locale: "es" }),
    "Maison v2 · Salvia y oliva · x",
  );
});

test("custom colours win; Maison keeps its own palettes", () => {
  assert.equal(
    designSummaryLine({
      designSlug: "maison-v2",
      lookSlug: null,
      paletteKey: null,
      customPalette: { name: { en: "Noir rose", es: "Noir rosa" } },
      tail: "Your content",
      locale: "en",
    }),
    "Maison v2 · Noir rose · Your content",
  );
  const maison = designSummaryLine({ designSlug: "maison", lookSlug: null, paletteKey: "pink", customPalette: null, tail: "Live", locale: "en" });
  assert.match(maison, /^Maison · .+ · Live$/);
  assert.doesNotMatch(maison, /Maison v2/);
});
