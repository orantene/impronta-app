import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { readAuthEmailDraft, writeAuthEmailDraft } from "./email-draft";

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
