import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("TUL-759: the generic login page offers a Create client account entry that keeps next", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(auth)/login/page.tsx"), "utf8");
  assert.match(src, /data-client-signup-link/);
  assert.match(src, /buildRegisterHref\("client", nextPath \? \{ next: nextPath \} : \{\}\)/);
  assert.match(src, /!passwordlessFirst && !proStartUrl/);
  for (const f of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${f}.json`), "utf8")).public.auth.login;
    assert.ok(m.clientPrompt && m.clientSignUp, f);
  }
});
