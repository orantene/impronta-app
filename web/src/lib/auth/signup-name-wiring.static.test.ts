import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("TUL-762: the client sign-up form collects a name in both lanes and the actions pass it on", () => {
  assert.match(read("src/app/(auth)/register/page.tsx"), /collectName\s+submitLabel/);
  assert.match(read("src/app/(auth)/register/page.tsx"), /collectName\s+hideFooter/);
  assert.match(read("src/components/auth/email-code-form.tsx"), /name="full_name"/);
  assert.match(read("src/app/(auth)/register/register-form.tsx"), /name="full_name"/);
  assert.match(read("src/app/auth/otp-actions.ts"), /fullName: String\(formData\.get\("full_name"\)/);
  assert.match(read("src/app/auth/actions.ts"), /signupNameMetadata\(formData\.get\("full_name"\)\)/);
});
