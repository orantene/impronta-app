import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("TUL-762: the client sign-up form collects a name in both lanes and the actions pass it on", () => {
  assert.match(read("src/app/(auth)/register/page.tsx"), /collectName\s+clientSignup\s+submitLabel/);
  assert.match(read("src/app/(auth)/register/page.tsx"), /collectName\s+clientSignup\s+hideFooter/);
  assert.match(read("src/components/auth/email-code-form.tsx"), /name="full_name"/);
  assert.match(read("src/app/(auth)/register/register-form.tsx"), /name="full_name"/);
  assert.match(read("src/app/auth/otp-actions.ts"), /fullName: String\(formData\.get\("full_name"\)/);
  assert.match(read("src/app/auth/actions.ts"), /signupNameMetadata\(formData\.get\("full_name"\)\)/);
});

test("TUL-762: the name reaches the profile on create (metadata full_name is copied by handle_new_user)", () => {
  const actions = read("src/app/auth/actions.ts");
  assert.match(actions, /signupNameMetadata\(formData\.get\("full_name"\)\)/);
  assert.match(read("src/app/auth/otp-actions.ts"), /fullName/);
  const migration = readFileSync(join(process.cwd(), "..", "supabase/migrations/20260526032907_fix_handle_new_user_signup_intent.sql"), "utf8");
  assert.match(migration, /raw_user_meta_data\s*->>\s*'full_name'/);
});
