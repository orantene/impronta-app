import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { shouldResetLocaleCookiesOnSignIn } from "./locale-owner";

test("a different user signing in resets the cookie-derived locale", () => {
  assert.equal(shouldResetLocaleCookiesOnSignIn({ cookieOwner: "admin", userId: "valeria" }), true);
  assert.equal(shouldResetLocaleCookiesOnSignIn({ cookieOwner: null, userId: "valeria" }), true);
});

test("the same user signing in again keeps their cookie", () => {
  assert.equal(shouldResetLocaleCookiesOnSignIn({ cookieOwner: "valeria", userId: "valeria" }), false);
});

test("both email sign-in actions reset the locale, and the builder reconciles itself", () => {
  const root = join(__dirname, "..");
  const actions = readFileSync(join(root, "app/auth/actions.ts"), "utf8");
  assert.equal((actions.match(/\bresetLocaleOnSignIn\(user\.id\)|\bresetLocaleOnSignIn\(data\.user\.id\)/g) ?? []).length, 2);
  const builder = readFileSync(join(root, "app/(workspace)/talent/page-builder/page.tsx"), "utf8");
  assert.match(builder, /talentLocaleSeedPlan\(/);
  const layout = readFileSync(join(root, "app/(workspace)/talent/_talent-layout-inner.tsx"), "utf8");
  assert.match(layout, /talentLocaleSeedPlan\(/);
});
