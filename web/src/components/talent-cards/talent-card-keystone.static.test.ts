import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * KEYSTONE guard — the canonical <TalentCard> MUST emit `className="talent-card"`
 * on BOTH render branches and carry the `data-card-*` hooks. Without that class,
 * the entire token-presets.css `.talent-card` family + every `directory.card.*`
 * design token is a silent no-op (the exact bug the unified card system fixes).
 *
 * This is a source-text invariant (not a render test) so it is dependency-free
 * and gates in the existing tsx `--test` lane (test:builder-capabilities:a) with
 * no next/image / jsdom runtime. A render swap that drops the class fails here.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cardSrc = readFileSync(join(here, "TalentCard.tsx"), "utf8");
const shapeSrc = readFileSync(join(here, "talent-card-shape.ts"), "utf8");

test("shape defines the canonical keystone class as 'talent-card'", () => {
  assert.match(
    shapeSrc,
    /TALENT_CARD_CLASS\s*=\s*"talent-card"/,
    "TALENT_CARD_CLASS must be the literal 'talent-card' the CSS family targets",
  );
});

test("TalentCard emits the keystone class on BOTH render branches", () => {
  const occurrences = cardSrc.match(/\$\{TALENT_CARD_CLASS\}/g) ?? [];
  assert.ok(
    occurrences.length >= 2,
    `expected the keystone class on both the editorial + portrait root Links; found ${occurrences.length}`,
  );
  assert.match(cardSrc, /data-card-style="editorial"/);
  assert.match(cardSrc, /data-card-style="portrait"/);
});

test("TalentCard carries the data-card-* style hooks the token family targets", () => {
  for (const hook of [
    "data-card-media",
    "data-card-name",
    "data-card-body",
    "data-card-availability",
    "data-card-chip",
  ]) {
    assert.ok(
      cardSrc.includes(hook),
      `canonical card must expose the ${hook} hook for the .talent-card token family`,
    );
  }
});
