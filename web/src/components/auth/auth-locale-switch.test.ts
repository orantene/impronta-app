import assert from "node:assert/strict";
import test from "node:test";

import { authLocaleSwitchHref } from "./auth-locale-switch";

test("switching to EN from /es/login drops the prefix and keeps the query", () => {
  assert.equal(authLocaleSwitchHref("/es/login", "?next=%2Ftalent", "en"), "/login?next=%2Ftalent");
  assert.equal(authLocaleSwitchHref("/es", "", "en"), "/");
});

test("switching to ES from /login reloads the same URL", () => {
  assert.equal(authLocaleSwitchHref("/login", "?next=%2Fx", "es"), "/login?next=%2Fx");
});

test("an explicit ?lang= is rewritten, otherwise it would outrank the cookie and kill the toggle", () => {
  assert.equal(authLocaleSwitchHref("/login", "?lang=en", "es"), "/login?lang=es");
  assert.equal(authLocaleSwitchHref("/login", "?next=%2Fx&lang=en", "es"), "/login?next=%2Fx&lang=es");
});

test("the toggle component uses the helper", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(`${__dirname}/auth-card-locale-toggle.tsx`, "utf8");
  assert.match(src, /authLocaleSwitchHref\(/);
});
