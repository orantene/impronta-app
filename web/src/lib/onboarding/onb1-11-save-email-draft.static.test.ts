import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * onb1-11 — cuenta email kept only the first character (focus lost on remount).
 * Draft must live on OnboardingModule; SaveStep must not own local useState for it.
 */

const root = process.cwd();

test("onb1-11: module owns save email/ageTerms draft state", () => {
  const mod = readFileSync(join(root, "src/components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(mod, /saveEmailDraft/);
  assert.match(mod, /setSaveEmailDraft/);
  assert.match(mod, /saveAgeTermsDraft/);
  assert.match(mod, /email=\{saveEmailDraft\}/);
  assert.match(mod, /onEmailChange=\{setSaveEmailDraft\}/);
  assert.match(mod, /ageTerms=\{saveAgeTermsDraft\}/);
});

test("onb1-11: SaveStep takes email draft via props (no local email useState)", () => {
  const src = readFileSync(join(root, "src/components/onboarding/steps/save-step.tsx"), "utf8");
  assert.match(src, /email: string/);
  assert.match(src, /onEmailChange: \(email: string\) => void/);
  assert.match(src, /onEmailChange\(e\.target\.value\)/);
  // Avoid mobile type=email rewrite fighting the controlled value.
  assert.match(src, /id="onb-email"[\s\S]*?type="text"/);
  assert.match(src, /id="onb-email"[\s\S]*?inputMode="email"/);
  assert.doesNotMatch(src, /useState\(/);
  assert.doesNotMatch(src, /id="onb-email"[\s\S]*?type="email"/);
});
