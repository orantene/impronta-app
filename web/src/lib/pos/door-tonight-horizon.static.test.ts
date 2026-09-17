import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * D-161: the door (and its lookup / Delivery sheet) could only see nights
 * within 14 days, so a night sold three weeks out could not be named or
 * re-sent from the door. The horizon is now a named constant and the
 * empty-state copy must agree with it in every language.
 */
const src = readFileSync(new URL("./door-tonight.ts", import.meta.url), "utf8");

test("the door horizon is 30 days and the query uses the constant", () => {
  assert.match(src, /export const DOOR_HORIZON_DAYS = 30;/);
  assert.match(src, /DOOR_HORIZON_DAYS \* 24 \* 60 \* 60_000/);
  assert.doesNotMatch(src, /14 \* 24 \* 60 \* 60_000/);
});

test("the empty-state copy says 30 days in en/es/fr", () => {
  for (const [lang, needle] of [["en", "next 30 days"], ["es", "próximos 30 días"], ["fr", "30 prochains jours"]] as const) {
    const json = readFileSync(new URL(`../../../messages/${lang}.json`, import.meta.url), "utf8");
    assert.ok(json.includes(needle), `${lang} copy says ${needle}`);
    assert.ok(!/at this door in the next two weeks|puerta en las próximas dos semanas|porte dans les deux prochaines semaines/.test(json), `${lang} no longer says two weeks`);
  }
}); 
