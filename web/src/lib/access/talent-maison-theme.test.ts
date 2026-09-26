/**
 * Maison theme flag — default off unless explicitly enabled.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { isTalentMaisonThemeEnabled } from "./talent-maison-theme";

const SWITCH = "TALENT_MAISON_THEME_ENABLED";

function withSwitch(value: string | undefined, body: () => void): void {
  const previous = process.env[SWITCH];
  if (value === undefined) delete process.env[SWITCH];
  else process.env[SWITCH] = value;
  try {
    body();
  } finally {
    if (previous === undefined) delete process.env[SWITCH];
    else process.env[SWITCH] = previous;
  }
}

test("Maison theme flag is off when unset", () => {
  withSwitch(undefined, () => {
    assert.equal(isTalentMaisonThemeEnabled(), false);
  });
});

test("Maison theme flag is on for true/1 only", () => {
  withSwitch("true", () => {
    assert.equal(isTalentMaisonThemeEnabled(), true);
  });
  withSwitch("1", () => {
    assert.equal(isTalentMaisonThemeEnabled(), true);
  });
  withSwitch("yes", () => {
    assert.equal(isTalentMaisonThemeEnabled(), false);
  });
});
