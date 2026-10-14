import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// TUL-762: the client sign-up collects a name and keeps it on the profile.
test("register's client email-code form asks for a name", () => {
  const page = read("src/app/(auth)/register/page.tsx");
  assert.match(page, /<EmailCodeForm[\s\S]{0,200}collectName/);
  const form = read("src/components/auth/email-code-form.tsx");
  assert.match(form, /const askName = collectName && allowCreate/);
  assert.match(form, /autoComplete="name"/);
  // Carried into the verify step, where the account is confirmed.
  assert.match(form, /name="name" value=\{nameDraft\.trim\(\)\}/);
  for (const l of ["en", "es"]) {
    const f = JSON.parse(read(`messages/${l}.json`)).public.auth.form;
    assert.ok(f.name && f.namePlaceholder, l);
  }
});

test("verify saves the name only on the create path and never overwrites an existing one", () => {
  const a = read("src/app/auth/otp-actions.ts");
  const verify = a.slice(a.indexOf("export async function submitEmailCode"));
  assert.match(verify, /formData\.get\("create"\) \?\? ""\) === "1"\) \{\s*const name = cleanSignupName/);
  assert.match(a, /\.or\("display_name\.is\.null,display_name\.eq\."\)/);
  assert.match(a, /v\.length <= 120/);
});
