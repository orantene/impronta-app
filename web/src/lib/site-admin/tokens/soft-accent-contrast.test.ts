/** TUL-377: accent text on the soft-accent fill, and muted text, always clear AA (4.5:1). */
import assert from "node:assert/strict";
import test from "node:test";

import { contrastRatio, ensureContrast } from "./contrast-pair";
import { designTokensToCssVars } from "./resolve";

// Sofia Rinaldi demo (Maison v2, custom accent), read from the public HTML CSS variables.
const SOFIA = {
  "color.accent": "#E3487E",
  "color.primary": "#E3487E",
  "color.background": "#151012",
  "color.surface-raised": "#1E171A",
  "color.blush": "#3A2029",
  "color.muted": "#B8A5A9",
  "color.ink": "#F7EEF0",
};
// Rose palette (passes already): accent text must stay unchanged.
const JOR = {
  "color.ink": "#241417",
  "color.line": "#EFDFE3",
  "color.blush": "#FBE6EC",
  "color.muted": "#7B6468",
  "color.accent": "#B3174A",
  "color.primary": "#B3174A",
  "color.background": "#FCF7F7",
  "color.surface-raised": "#FFFFFF",
};

test("Sofia accent text clears AA on the soft accent fill", () => {
  assert.ok(contrastRatio("#E3487E", SOFIA["color.blush"])! < 4.5);
  const v = designTokensToCssVars(SOFIA);
  const t = v["--token-color-accent-text"]!;
  for (const bg of [SOFIA["color.blush"], SOFIA["color.surface-raised"], SOFIA["color.background"]]) {
    assert.ok(contrastRatio(t, bg)! >= 4.5, `${t} on ${bg}`);
  }
});

test("a palette that already passes keeps its accent text", () => {
  const v = designTokensToCssVars(JOR);
  assert.equal(v["--token-color-accent-text"], "#B3174A");
  assert.ok(contrastRatio(v["--token-color-accent-text"]!, JOR["color.blush"])! >= 4.5);
});

test("muted text is guaranteed AA on the page", () => {
  const weak = { ...JOR, "color.muted": "#d9cfd1" };
  const v = designTokensToCssVars(weak);
  assert.ok(contrastRatio(v["--token-color-muted-text"]!, weak["color.background"])! >= 4.5);
});

test("ensureContrast handles light and dark backgrounds", () => {
  const onLight = ensureContrast("#f4a3c0", "#ffffff", 4.5)!;
  const onDark = ensureContrast("#6b1236", "#151012", 4.5)!;
  assert.ok(contrastRatio(onLight, "#ffffff")! >= 4.5);
  assert.ok(contrastRatio(onDark, "#151012")! >= 4.5);
  assert.equal(ensureContrast("#000000", "#ffffff"), "#000000");
  assert.equal(ensureContrast("nope", "#ffffff"), null);
});
