import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/** onb1-11: the save-step email draft lives on the module so it survives step navigation. */
const root = process.cwd();

test("onb1-11: module owns the save email draft", () => {
  const mod = readFileSync(join(root, "src/components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(mod, /setSaveEmailDraft/);
  assert.match(mod, /email=\{saveEmailDraft\}/);
  assert.match(mod, /onEmailChange=\{setSaveEmailDraft\}/);
  assert.match(mod, /setSaveEmailDraft\(state\.codeEmail\)/);
});

test("onb1-11: SaveStep takes the email via props, no local email state", () => {
  const src = readFileSync(join(root, "src/components/onboarding/steps/save-step.tsx"), "utf8");
  assert.match(src, /onEmailChange: \(email: string\) => void/);
  assert.match(src, /onEmailChange\(e\.target\.value\)/);
  assert.doesNotMatch(src, /const \[email, setEmail\]/);
  assert.match(src, /id="onb-email"[\s\S]*?type="text"/);
  assert.match(src, /id="onb-email"[\s\S]*?inputMode="email"/);
});
