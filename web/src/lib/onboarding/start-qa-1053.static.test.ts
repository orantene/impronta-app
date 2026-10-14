import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../../components/onboarding/${p}`, import.meta.url), "utf8");

test("TUL-807: step 3 fields scroll clear of the sticky Continue bar", () => {
  assert.match(read("steps/setup-step.tsx"), /\[&_input\]:scroll-mb-28/);
  assert.match(read("steps/setup-step.tsx"), /\[&_select\]:scroll-mb-28/);
});

test("TUL-894: the resume card shows no quote box for blank words", () => {
  assert.match(read("steps/resume-card.tsx"), /\.trim\(\)/);
});

test("TUL-894: a typed city can be used without picking a suggestion", () => {
  assert.match(read("steps/picker.tsx"), /-use-typed/);
  assert.match(read("steps/essentials-step.tsx"), /useTyped/);
  for (const lang of ["en", "es"]) {
    const j = JSON.parse(readFileSync(new URL(`../../../messages/${lang}.json`, import.meta.url), "utf8"));
    assert.match(j.public.onboarding.questions.useTyped, /\{text\}/, lang);
    assert.ok(!j.public.onboarding.questions.useTyped.includes("—"));
  }
});
