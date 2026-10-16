import { test } from "node:test";
import assert from "node:assert/strict";

import { searchBusinessTypes } from "./business-types";

/**
 * TUL-1127 (guard for TUL-802): the /start category search finds trades by the
 * words people actually type, in English and Spanish, with or without accents.
 */
const CASES: ReadonlyArray<readonly [string, string]> = [
  ["uñas", "nail-salon"],
  ["unas", "nail-salon"],
  ["barber", "barber-shop"],
  ["masaje", "mobile-massage-service"],
  ["massage", "massage-therapist"],
  ["tatuajes", "tattoo-studio"],
  ["tattoo", "tattoo-studio"],
  ["fotógrafo", "portrait-photographer"],
  ["photographer", "portrait-photographer"],
  ["entrenador personal", "personal-trainer"],
  ["personal trainer", "personal-trainer"],
  ["pestañas", "eyelash-studio"],
  ["makeup", "makeup-artist"],
];

for (const [word, id] of CASES) {
  test(`TUL-1127: searching "${word}" finds ${id}`, () => {
    const ids = searchBusinessTypes(word).map((row) => row.id);
    assert.ok(ids.includes(id), `expected ${id} in [${ids.join(", ")}]`);
  });
}

test("TUL-1127: the custom catch-all never shows up as a search hit", () => {
  assert.ok(!searchBusinessTypes("uñas").some((row) => row.id === "custom"));
});
