import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const form = readFileSync(join(process.cwd(), "src/app/(auth)/login/login-form.tsx"), "utf8");

test("TUL-768: the login email is controlled so a failed attempt does not wipe it", () => {
  assert.match(form, /const \[email, setEmail\] = useState\(pickAuthEmail\(readAuthEmailDraft\(\), defaultEmail\)\)/);
  assert.match(form, /value=\{email\}/);
  assert.doesNotMatch(form, /defaultValue=\{defaultEmail\}/);
});
