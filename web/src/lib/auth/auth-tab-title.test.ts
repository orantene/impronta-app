import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { authTabTitleMessageKey } from "./auth-tab-title";

test("authTabTitleMessageKey maps login / register / password routes", () => {
  assert.equal(authTabTitleMessageKey("/login"), "public.auth.login.title");
  assert.equal(authTabTitleMessageKey("/login/"), "public.auth.login.title");
  assert.equal(authTabTitleMessageKey("/register"), "public.auth.register.title");
  assert.equal(authTabTitleMessageKey("/register/accept-terms"), "public.auth.register.title");
  assert.equal(authTabTitleMessageKey("/forgot-password"), "public.auth.forgot.title");
  assert.equal(authTabTitleMessageKey("/update-password"), "public.auth.update.title");
  assert.equal(authTabTitleMessageKey("/"), null);
  assert.equal(authTabTitleMessageKey("/start"), null);
});

test("auth layout generateMetadata uses authTabTitleMessageKey for platform hosts", () => {
  const layout = readFileSync(
    path.join(process.cwd(), "src/app/(auth)/layout.tsx"),
    "utf8",
  );
  assert.match(layout, /authTabTitleMessageKey/);
  assert.match(layout, /public\.auth\.login\.title|authTabTitleMessageKey/);
  assert.match(layout, /title:\s*pageTitle/);
});
