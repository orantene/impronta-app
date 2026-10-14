import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { appLandingCopy } from "../../components/home/app-landing-copy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const catalog = (l: string) => JSON.parse(read(`messages/${l}.json`)).public.auth.login;

// TUL-759: login "Sign up" and app-host "Create an account" are the business
// /start; each now also offers the client register door.
test("/login offers a client sign-up next to the business sign-up", () => {
  const page = read("src/app/(auth)/login/page.tsx");
  assert.match(page, /data-client-signup-link/);
  assert.match(page, /buildRegisterHref\("client"/);
  assert.match(page, /public\.auth\.login\.clientSignUp"/);
  for (const l of ["en", "es"]) {
    assert.ok(catalog(l).clientSignUp && catalog(l).clientSignUpPrompt, l);
  }
});

test("the app-host landing links to /register?as=client in both languages", () => {
  assert.match(read("src/components/home/app-landing.tsx"), /href="\/register\?as=client"/);
  for (const l of ["en", "es"]) assert.ok(appLandingCopy(l, "Tulala").createClientAccount.length > 10);
});
