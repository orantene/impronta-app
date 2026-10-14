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
  assert.match(src, /signOutRedirectPath\(request\.headers\.get\("referer"\), request\.url\)/);
});
