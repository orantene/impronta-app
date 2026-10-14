import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-910: login subtitle and the code-sent notice are one short line each.
test("login subtitle and sent notice stay short in EN and ES", () => {
  for (const l of ["en", "es"]) {
    const a = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8")).public.auth;
    for (const v of [a.login.description, a.login.descriptionNoApple, a.passwordless.sentNotice]) {
      assert.ok(v.length <= 45, `${l}: ${v}`);
    }
    assert.match(a.passwordless.sentNotice, /\{email\}/);
  }
});
