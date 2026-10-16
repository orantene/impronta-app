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

test("TUL-778: login and register read the same two labels in both locales (code button, password submit)", () => {
  const want = {
    en: { code: "Email me a code", pw: "Log in" },
    es: { code: "Envíame un código", pw: "Iniciar sesión" },
  } as const;
  for (const f of ["en", "es"] as const) {
    const a = load(f);
    // the code label is one string for the register button, the login button and the lane switch
    assert.equal(a.passwordless.emailSubmit, want[f].code, `${f}: code button`);
    assert.equal(a.passwordless.useCode, want[f].code, `${f}: lane switch`);
    // the password lane's submit is the same string the register page links back with
    assert.equal(a.login.emailSubmit, want[f].pw, `${f}: password submit`);
    for (const k of ["emailSubmit", "useCode"]) assert.ok(a.passwordless[k]?.trim(), `${f}: ${k} present`);
  }
});

test("TUL-778: register's client code lane and login's password lane are wired to those shared keys", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  assert.match(read("src/app/(auth)/register/page.tsx"), /submitLabel=\{t\("public\.auth\.passwordless\.emailSubmit"\)\}/);
  assert.match(read("src/components/auth/email-code-form.tsx"), /public\.auth\.passwordless\.emailSubmit/);
  assert.match(read("src/components/auth/email-code-form.tsx"), /public\.auth\.passwordless\.useCode/);
  assert.match(read("src/app/(auth)/login/login-form.tsx"), /public\.auth\.login\.emailSubmit/);
});
