import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FLOW_STEP_OF } from "./flow";

const read = (p: string) => readFileSync(new URL(`../../components/onboarding/${p}`, import.meta.url), "utf8");

test("the 18+ tick survives leaving and returning to the save step", () => {
  assert.match(read("steps/save-step.tsx"), /initialAgeTerms/);
  assert.match(read("onboarding-module.tsx"), /initialAgeTerms=\{ageTermsGiven\}/);
});

test("three screens no longer share one step number", () => {
  const threes = Object.entries(FLOW_STEP_OF).filter(([, n]) => n === 3).map(([s]) => s);
  assert.ok(!threes.includes("essentials") || !threes.includes("readyToBuild"));
  assert.ok(threes.length <= 3, threes.join());
  assert.equal(FLOW_STEP_OF.readyToBuild, 4);
});

test("error notices scroll themselves into view", () => {
  assert.match(read("ui.tsx"), /scrollIntoView/);
});

test("ready step fact labels stack on a 390px screen instead of wrapping in a 96px column", () => {
  const s = read("steps/ready-step.tsx");
  assert.ok(!s.includes("w-24 shrink-0"));
  assert.match(s, /flex-col[^"]*sm:flex-row/);
});

test("the style notes label is short enough for one line", () => {
  for (const lang of ["en", "es"]) {
    const j = JSON.parse(readFileSync(new URL(`../../../messages/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(j.public.onboarding.style.notesLabel.length <= 28, lang);
  }
});

test("the services line is localized on the understood card", () => {
  assert.match(read("steps/understood-step.tsx"), /localizeServicesDisplay/);
});
