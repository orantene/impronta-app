import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const load = (f: string) => JSON.parse(readFileSync(join(process.cwd(), `messages/${f}.json`), "utf8")).public.auth;

test("TUL-778: one label for 'email me a code' everywhere, ES and EN", () => {
  for (const f of ["en", "es"]) {
    const a = load(f);
    assert.equal(a.passwordless.emailSubmit, a.passwordless.useCode, `${f}: the step-1 button and the lane-switch link must read the same`);
  }
  assert.equal(load("en").passwordless.emailSubmit, "Email me a code");
  assert.equal(load("es").passwordless.emailSubmit, "Envíame un código");
});

test("TUL-778: the password submit button is just 'Log in', not 'Log in with email'", () => {
  assert.equal(load("en").login.emailSubmit, "Log in");
  assert.equal(load("es").login.emailSubmit, "Iniciar sesión");
});
