import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { loginErrorMessage } from "./login-error-copy";

const catalog = (l: string) => JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));
const tFor = (l: string) => (key: string) =>
  key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], catalog(l)) as string;

test("TUL-773: error codes map to human copy in EN and ES, never the raw code", () => {
  for (const l of ["en", "es"]) {
    const t = tFor(l);
    for (const code of ["auth", "oauth", "config", "AUTH"]) {
      const msg = loginErrorMessage(code, t);
      assert.ok(msg && msg.length > 20 && msg.toLowerCase() !== code.toLowerCase(), `${l} ${code}`);
      assert.doesNotMatch(msg, /—/);
    }
  }
  assert.match(loginErrorMessage("auth", tFor("en")), /expired or was already used/);
});

test("a human message from an action is shown decoded; a bad escape does not throw", () => {
  const t = (k: string) => k;
  assert.equal(loginErrorMessage("Invalid%20login%20credentials", t), "Invalid login credentials");
  assert.equal(loginErrorMessage("%E0%A4%A", t), "%E0%A4%A");
});

test("the login page uses the mapper", () => {
  const page = readFileSync(join(process.cwd(), "src/app/(auth)/login/page.tsx"), "utf8");
  assert.match(page, /loginErrorMessage\(error, t\)/);
  assert.doesNotMatch(page, /\{decodeURIComponent\(error\)\}/);
});
