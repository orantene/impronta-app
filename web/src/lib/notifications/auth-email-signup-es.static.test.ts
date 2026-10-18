import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { authEmailLocale } from "@/lib/notifications/auth-email-locale";
import { getEmailCopy } from "@/lib/notifications/email-copy";

// TUL-146 / TUL-814: repo side of the ES signup confirmation email.
const route = readFileSync("src/app/api/hooks/auth-email/route.ts", "utf8");
const actions = readFileSync("src/app/auth/actions.ts", "utf8");

test("hook derives locale from redirect ?lang= then user_metadata.lang and uses it for subject + template", () => {
  assert.match(route, /authEmailLocale\(data\.redirect_to, payload\.user\?\.user_metadata\?\.lang\)/);
  assert.match(route, /getEmailCopy\(locale\)\[copyKeyFor\(action\)\]\.subject/);
  assert.match(route, /const brand = \{ \.\.\.platformBrand\(\), locale \}/);
});

test("every signUp path stamps user_metadata.lang as the fallback", () => {
  const signUps = actions.split("emailRedirectTo").length - 1;
  const stamped = (actions.match(/lang: /g) ?? []).length;
  assert.ok(stamped >= signUps, `signUp paths ${signUps}, lang stamps ${stamped}`);
});

test("an ES signup (lang lost from the redirect) renders the Spanish subject", () => {
  const locale = authEmailLocale("https://app.tulala.digital/auth/callback?next=%2F", "es");
  assert.equal(locale, "es");
  assert.equal(getEmailCopy(locale)["auth.signup"].subject, "Confirma tu correo");
});
