import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { pickAuthEmail, readAuthEmailDraft, writeAuthEmailDraft } from "./email-draft";

test("TUL-768: the typed email is kept across lane switches", () => {
  writeAuthEmailDraft("ana@example.com");
  assert.equal(readAuthEmailDraft(), "ana@example.com");
  writeAuthEmailDraft("");
  assert.equal(readAuthEmailDraft(), "");
});

test("TUL-768: the code lane, the password lane and the sign-up lane all read and write the draft", () => {
  for (const rel of ["src/components/auth/email-code-form.tsx", "src/app/(auth)/login/login-form.tsx", "src/app/(auth)/register/register-form.tsx"]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(src, /readAuthEmailDraft\(\)/, rel);
    assert.match(src, /writeAuthEmailDraft\(/, rel);
  }
});

test("TUL-768 round 2: both directions keep the typed email (code -> password and password -> code)", () => {
  // code lane: visitor types, then switches to the password lane
  writeAuthEmailDraft("ana@example.com");
  assert.equal(pickAuthEmail(readAuthEmailDraft(), "page-default@example.com"), "ana@example.com");
  // password lane: visitor edits the address, then switches back to the code lane
  writeAuthEmailDraft("ana.b@example.com");
  assert.equal(pickAuthEmail(readAuthEmailDraft(), "page-default@example.com"), "ana.b@example.com");
  // a fresh form still gets the page default
  writeAuthEmailDraft("");
  assert.equal(pickAuthEmail(readAuthEmailDraft(), "page-default@example.com"), "page-default@example.com");
  assert.equal(pickAuthEmail(readAuthEmailDraft(), null), "");
});

test("TUL-768 round 2: the lanes use pickAuthEmail and the back-to-code toggle refreshes the draft", () => {
  const code = readFileSync(join(process.cwd(), "src/components/auth/email-code-form.tsx"), "utf8");
  assert.match(code, /defaultValue=\{pickAuthEmail\(readAuthEmailDraft\(\), email\)\}/);
  assert.match(code, /setEmailDraft\(readAuthEmailDraft\(\)\);\s*setShowPassword\(false\)/);
  const login = readFileSync(join(process.cwd(), "src/app/(auth)/login/login-form.tsx"), "utf8");
  assert.match(login, /useState\(pickAuthEmail\(readAuthEmailDraft\(\), defaultEmail\)\)/);
  const reg = readFileSync(join(process.cwd(), "src/app/(auth)/register/register-form.tsx"), "utf8");
  assert.match(reg, /defaultValue=\{pickAuthEmail\(readAuthEmailDraft\(\), defaultEmail\)\}/);
});
