/**
 * TUL-1150: guard for TUL-809. The save step asks for consent once, above
 * both ways in, and that one checkbox gates Google and the email code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "save-step.tsx"), "utf8");

test("TUL-809: exactly one consent checkbox on the save step", () => {
  assert.equal(src.match(/data-testid="onb-age-terms"/g)?.length ?? 0, 1);
  assert.equal(src.match(/type="checkbox"/g)?.length ?? 0, 1);
});

test("TUL-809: the checkbox sits above the Google button", () => {
  const box = src.indexOf('data-testid="onb-age-terms"');
  const google = src.indexOf('data-testid="onb-google"');
  assert.ok(box > 0 && google > box, "consent must come before Google");
});

test("TUL-809: one consent gates both Google and the email code", () => {
  assert.match(src, /disabled=\{!ageTerms\}/, "Google waits for consent");
  assert.match(src, /disabled=\{[^}]*!ageTerms[^}]*\}\s*testId="onb-email-cta"/, "email CTA waits for consent");
  assert.match(src, /email\.trim\(\) && ageTerms && !busy/, "submit path re-checks consent");
});

test("TUL-809: no second 'by continuing you accept' line", () => {
  assert.doesNotMatch(src, /"public\.onboarding\.save\.terms"/);
});
