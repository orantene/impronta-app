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

test("TUL-1169: both signup forms link consent and email to their own error id", () => {
  for (const form of [emailForm, registerForm]) {
    assert.match(form, /errorId=\{AUTH_ERROR_IDS\.consent\}/);
    assert.match(form, /aria-invalid=\{errField === "email" \? true : undefined\}/);
    assert.match(form, /aria-describedby=\{errField === "email" \? AUTH_ERROR_IDS\.email : undefined\}/);
    assert.match(form, /invalid=\{errField === "consent"\}/);
    // the name field has no error of its own: it must never point at the shared notice
    assert.doesNotMatch(form, /id="full_name"[\s\S]{0,400}aria-(invalid|describedby)/);
  }
});
