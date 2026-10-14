import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-785: an empty password field showing "••••••••" reads as already filled.
// The field keeps its label; no dot placeholder on any sign-in or sign-up form.
test("no auth password field uses a dot placeholder", () => {
  for (const f of [
    "src/app/(auth)/register/register-form.tsx",
    "src/app/(auth)/update-password/update-password-form.tsx",
    "src/app/(auth)/login/login-form.tsx",
    "src/components/marketing/login-modal.tsx",
    "src/components/marketing/talent-register-modal.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), f), "utf8"), /placeholder="[•·*]+"/, f);
  }
});
