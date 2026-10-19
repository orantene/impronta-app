import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { signOutRedirectPath } from "./sign-out-redirect";

const req = "https://tulala.digital/auth/sign-out";

test("signing out from a Spanish page lands on the Spanish home", () => {
  assert.equal(signOutRedirectPath("https://tulala.digital/es", req), "/es");
  assert.equal(signOutRedirectPath("https://tulala.digital/es/", req), "/es");
  assert.equal(signOutRedirectPath("https://tulala.digital/es/pricing?x=1", req), "/es");
});

test("English pages, look-alikes, other origins and no Referer land on /", () => {
  assert.equal(signOutRedirectPath("https://tulala.digital/", req), "/");
  assert.equal(signOutRedirectPath("https://tulala.digital/pricing", req), "/");
  assert.equal(signOutRedirectPath("https://tulala.digital/escape", req), "/");
  assert.equal(signOutRedirectPath("https://evil.example/es", req), "/");
  assert.equal(signOutRedirectPath(null, req), "/");
  assert.equal(signOutRedirectPath("not a url", req), "/");
});

test("the sign-out route redirects through the helper", () => {
  const src = readFileSync(join(process.cwd(), "src/app/auth/sign-out/route.ts"), "utf8");
  assert.match(src, /signOutRedirectPath\(\s*request\.headers\.get\("referer"\),\s*request\.url,/);
});

// TUL-146: dashboards live at unprefixed URLs (/talent/today), so the Referer
// says nothing about language there. The locale cookie is the signal.
test("signing out of an unprefixed dashboard keeps a Spanish locale cookie", () => {
  const dash = "https://app.tulala.digital/talent/today";
  const r = "https://app.tulala.digital/auth/sign-out";
  assert.equal(signOutRedirectPath(dash, r, "es"), "/es");
  assert.equal(signOutRedirectPath(null, r, "es"), "/es");
  assert.equal(signOutRedirectPath(dash, r, "en"), "/");
  assert.equal(signOutRedirectPath(dash, r, null), "/");
  assert.equal(signOutRedirectPath(dash, r, "fr"), "/");
});

test("the sign-out route passes the locale cookie to the helper", () => {
  const src = readFileSync(join(process.cwd(), "src/app/auth/sign-out/route.ts"), "utf8");
  assert.match(src, /p\.name === "locale"/);
});
