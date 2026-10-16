import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isEmailNotConfirmed } from "./email-not-confirmed";

test("TUL-767: an unverified account is recognised by code or message; other errors are not", () => {
  assert.equal(isEmailNotConfirmed({ code: "email_not_confirmed", message: "x" }), true);
  assert.equal(isEmailNotConfirmed({ message: "Email not confirmed" }), true);
  assert.equal(isEmailNotConfirmed({ code: "invalid_credentials", message: "Invalid login credentials" }), false);
  assert.equal(isEmailNotConfirmed(null), false);
  assert.equal(isEmailNotConfirmed("Email not confirmed"), false);
});

test("TUL-767: the sign-in action names the unverified state and the copy points to the code option", () => {
  const action = readFileSync(join(process.cwd(), "src/app/auth/actions.ts"), "utf8");
  assert.match(action, /isEmailNotConfirmed\(error\)\) \{\s*return \{ error: t\("public\.auth\.errors\.emailNotConfirmed"\)/);
  for (const f of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${f}.json`), "utf8")).public.auth.errors.emailNotConfirmed as string;
    assert.doesNotMatch(m, /password|contraseña/i, "must not be re-mapped to invalid credentials by the login form");
    assert.match(m, f === "en" ? /Email me a code/ : /Envíame un código/);
  }
});

test("TUL-767: real Error instances and message variants are recognised; unrelated errors never are", () => {
  assert.equal(isEmailNotConfirmed(new Error("Email not confirmed")), true);
  assert.equal(isEmailNotConfirmed({ message: "EMAIL NOT CONFIRMED" }), true);
  assert.equal(isEmailNotConfirmed({ code: "email_not_confirmed" }), true);
  for (const e of [undefined, 42, {}, { message: 7 }, new Error("Too many requests"), { code: "over_request_rate_limit", message: "rate" }]) {
    assert.equal(isEmailNotConfirmed(e), false, JSON.stringify(e));
  }
});

test("TUL-767: the message offers the resend action by its exact on-screen label, in ES and EN, and survives the login form's error mapper", () => {
  for (const f of ["en", "es"]) {
    const a = JSON.parse(readFileSync(join(process.cwd(), `messages/${f}.json`), "utf8")).public.auth;
    const msg = a.errors.emailNotConfirmed as string;
    // the action the message names is the real button/link label, so the copy cannot drift from the UI
    assert.ok(msg.includes(a.passwordless.useCode), `${f}: message names "${a.passwordless.useCode}"`);
    // and none of the words the login form's mapper re-classifies on
    assert.doesNotMatch(msg, /invalid login|invalid credentials|too many|network|fetch/i, `${f}: must not be remapped`);
    assert.notEqual(msg, a.errors.invalidCredentials, `${f}: distinct from the wrong-password message`);
  }
});
