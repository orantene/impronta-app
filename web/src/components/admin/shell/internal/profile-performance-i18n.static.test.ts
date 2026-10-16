/**
 * TUL-146: the "Desempeño del perfil" card (EngagementStrip) must not draw
 * English on a Spanish UI. Every copy.t("...") key used inside the component
 * has an ES row in the dashboard catalog.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { translateDashboardText } from "./dashboard-i18n";

const SRC = readFileSync(join(__dirname, "talent/shared/profile-sections-1.tsx"), "utf8");
const start = SRC.indexOf("export function EngagementStrip");
const end = SRC.indexOf("\nexport function", start + 10);
const BODY = SRC.slice(start, end === -1 ? undefined : end);
const KEYS = Array.from(new Set(Array.from(BODY.matchAll(/copy\.t\("([^"]+)"\)/g), (m) => m[1])));

describe("profile performance card is fully Spanish", () => {
  it("finds the card strings", () => assert.ok(KEYS.length >= 15, `got ${KEYS.length}`));
  for (const key of KEYS) {
    it(`has ES for "${key}"`, () => {
      const es = translateDashboardText(key, "es");
      assert.notEqual(es, key, `missing ES row for "${key}"`);
    });
  }
});
