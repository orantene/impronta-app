import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/** TUL-1125: the step-1 option cards work from the keyboard. */
const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/choose-step.tsx"), "utf8");

test("TUL-1125: cards are real buttons in a radiogroup with aria-checked", () => {
  assert.match(src, /role="radiogroup"/);
  assert.match(src, /<button[\s\S]*?role="radio"[\s\S]*?aria-checked=\{on\}/);
});

test("TUL-1125: roving tabindex gives the group a single Tab stop", () => {
  assert.match(src, /tabIndex=\{choice === tabStop \? 0 : -1\}/);
  assert.match(src, /const tabStop: OnboardingChoice = selected \?\? ORDER\[0\]/);
});

test("TUL-1125: arrow keys move and select, wrapping at both ends, and focus follows", () => {
  for (const k of ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"]) assert.match(src, new RegExp(k));
  assert.match(src, /% ORDER\.length/);
  assert.match(src, /setSelected\(next\)/);
  assert.match(src, /\.focus\(\)/);
});

test("TUL-1125: Enter and Space work because the cards are native buttons (no key swallowing)", () => {
  assert.doesNotMatch(src, /"Enter"|" "|"Space"/);
  assert.doesNotMatch(src, /<div[^>]*role="radio"/);
});

test("TUL-1125: cards show a visible focus ring", () => {
  assert.match(src, /focus-visible:outline-2/);
  assert.match(src, /focus-visible:outline-\[var\(--tl-forest\)\]/);
  assert.doesNotMatch(src, /outline-none/);
});

test("A11y: Home and End jump to the first and last card", () => {
  assert.match(src, /e\.key === "Home" \? 0/);
  assert.match(src, /e\.key === "End" \? ORDER\.length - 1/);
  assert.match(src, /edge !== null \? ORDER\[edge\]/, "the edge wins over the arrow step");
});
