import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-779 Confirm stays rendered with a pending state and the input refocuses on re-enable", () => {
  const confirm = read("src/components/auth/signup-code-confirm.tsx");
  assert.match(confirm, /<AuthSubmitButton\s+pending=\{verifying\}/);
  assert.doesNotMatch(confirm, /verifying\s*\?\s*null|!verifying\s*&&/);
  // TUL-1234: a failed verify must NOT clear the typed code.
  assert.doesNotMatch(confirm, /clearCount/);
  assert.match(confirm, /resetKey=\{resendCount\}/);
  const otp = read("src/components/auth/otp-code-input.tsx");
  assert.match(otp, /wasDisabled/);
});

test("TUL-1234: the code boxes read the freshest digits (fast typing drops none)", () => {
  const otp = read("src/components/auth/otp-code-input.tsx");
  assert.match(otp, /digitsRef\.current/);
  assert.doesNotMatch(otp, /const next = \[\.\.\.digits\]/);
});

test("TUL-1234: the single-field code step is controlled, so a failed verify keeps the code", () => {
  const form = read("src/components/auth/email-code-form.tsx");
  assert.match(form, /value=\{code\}/);
});

test("TUL-1235: the 18+ and Terms box survives a failed submit (controlled, draft-backed)", () => {
  const box = read("src/components/auth/age-terms-checkbox.tsx");
  assert.match(box, /checked=\{checked\}/);
  assert.match(box, /writeAuthConsentDraft\(/);
});
