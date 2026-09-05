import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pickSignupPreset } from "@/lib/words/signup-preset";

/**
 * Proven against El Paisa's REAL brief rows, read from production:
 *
 *   business.name         "Parrilla El Paisa"     ai_inference 0.45
 *   work.industry         "food and restaurant"   ai_inference 0.40
 *   presence.website_url  the menu URL            url_import   0.90
 *
 * There is no `business.description` fact. The intake stores what someone does
 * under `work.industry`, and `pickSignupPreset` only ever read the description
 * — so the industry was extracted correctly and then sat one field away from
 * the only reader that wanted it.
 */
const EL_PAISA_FACTS = [
  { factKey: "business.name", value: "Parrilla El Paisa" },
  { factKey: "work.industry", value: "food and restaurant" },
  { factKey: "presence.website_url", value: "https://firebasestorage.googleapis.com/…" },
];

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");
const signup = readFileSync(join(SRC, "lib/saas/workspace-signup.server.ts"), "utf8");

test("El Paisa's real brief yields the restaurant preset", () => {
  const industry = EL_PAISA_FACTS.find((f) => f.factKey === "work.industry")?.value;
  assert.equal(pickSignupPreset({ audience: "business", businessDescription: industry }), "restaurant");
});

test("and without it, the same signup derives nothing — this is what was broken", () => {
  // The lead row's description is empty for a brief-driven signup, so this is
  // exactly what provisioning saw before the brief was read.
  assert.equal(pickSignupPreset({ audience: "business", businessDescription: "" }), "custom");
});

test("a typed description still outranks the model's inference", () => {
  // `work.industry` here is a 0.40-confidence inference. A sentence the person
  // actually typed must win: the brief is the fallback, never the override.
  assert.match(signup, /lead\.business_description\?\.trim\(\)\s*\|\|\s*briefIndustry/);
});

test("the brief is read BEFORE the workspace row is inserted", () => {
  // `industry_preset` is written into the agency row at insert, and every seeded
  // page and nav label is derived from it once and never re-derived. Read the
  // brief after the insert and the facts arrive too late to decide anything.
  const read = signup.indexOf("loadBriefForSignupLead(");
  const insert = signup.indexOf('.from("agencies")\n    .insert({');
  assert.ok(read > 0 && insert > 0, "one of the two is missing");
  assert.ok(read < insert, "the brief is read after the workspace is created — too late to shape it");
});

test("a non-string fact value is treated as absent, not stringified", () => {
  // `BriefFact.value` is `unknown`. `[object Object]` reaching a keyword matcher
  // resolves to `custom` anyway — but silently, which is the failure mode this
  // whole lane exists to remove.
  assert.match(signup, /typeof industryFact === "string" \? industryFact : null/);
});
