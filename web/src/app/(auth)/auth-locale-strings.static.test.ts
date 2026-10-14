import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// TUL-146: the auth pages hard-coded an English placeholder and unprefixed
// links, so /es/login sent a Spanish visitor to English-default URLs.
test("auth forms localize the email placeholder", () => {
  for (const p of [
    "src/app/(auth)/login/login-form.tsx",
    "src/app/(auth)/register/register-form.tsx",
    "src/app/(auth)/forgot-password/forgot-password-form.tsx",
    "src/components/auth/email-code-form.tsx",
  ]) {
    assert.doesNotMatch(read(p), /placeholder="you@studio\.com"/, p);
    assert.match(read(p), /public\.auth\.form\.emailPlaceholder/, p);
  }
  for (const f of ["messages/en.json", "messages/es.json"]) {
    const m = JSON.parse(read(f)) as { public: { auth: { form: Record<string, string> } } };
    assert.ok(m.public.auth.form.emailPlaceholder, f);
  }
});

test("auth cross-links keep the visitor's locale prefix", () => {
  assert.match(read("src/app/(auth)/login/login-form.tsx"), /withLocaleHref\("\/forgot-password", locale\)/);
  assert.match(read("src/app/(auth)/forgot-password/forgot-password-form.tsx"), /withLocaleHref\("\/login", locale\)/);
  assert.match(read("src/app/(auth)/register/register-form.tsx"), /withLocaleHref\(/);
  assert.match(read("src/app/(auth)/login/page.tsx"), /withLocaleHref\(/);
});

test("support panel uses a singular string for exactly one new reply", () => {
  for (const f of ["messages/en.json", "messages/es.json"]) {
    const m = JSON.parse(read(f)) as { dashboard: { adminSupport: Record<string, string> } };
    assert.match(m.dashboard.adminSupport.newRepliesOne ?? "", /^1 /, f);
  }
  assert.match(read("src/components/support/SupportPanelHome.tsx"), /newRepliesOne/);
});
