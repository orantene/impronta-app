import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("./age-terms-checkbox.tsx", import.meta.url), "utf8");
const emailForm = readFileSync(new URL("./email-code-form.tsx", import.meta.url), "utf8");
const registerForm = readFileSync(
  new URL("../../app/(auth)/register/register-form.tsx", import.meta.url),
  "utf8",
);

test("TUL-1235: consent re-applies its checked state after a React form reset", () => {
  assert.match(src, /addEventListener\("reset"/);
  assert.match(src, /defaultChecked=\{checked\}/);
});

test("TUL-1169: consent exposes aria-invalid + aria-describedby tied to the error line", () => {
  assert.match(src, /aria-invalid=\{invalid \? true : undefined\}/);
  assert.match(src, /aria-describedby=\{invalid && errorId \? errorId : undefined\}/);
});

test("TUL-1169: both signup forms link consent and name to the visible error", () => {
  assert.match(emailForm, /errorId="email-step-error"/);
  assert.match(emailForm, /id="full_name"[\s\S]*aria-describedby=\{stepError \? "email-step-error"/);
  assert.match(registerForm, /errorId="register-form-error"/);
  assert.match(registerForm, /id="full_name"[\s\S]*aria-describedby=\{state\?\.error \? "register-form-error"/);
});
