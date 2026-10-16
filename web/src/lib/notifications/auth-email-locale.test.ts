import assert from "node:assert/strict";
import { test } from "node:test";

import { authEmailLocale } from "@/lib/notifications/auth-email-locale";

const R = "https://app.tulala.digital/auth/callback?next=%2F";

test("redirect ?lang= wins over metadata", () => {
  assert.equal(authEmailLocale(`${R}&lang=en`, "es"), "en");
  assert.equal(authEmailLocale(`${R}&lang=es`, "en"), "es");
});

test("falls back to user_metadata.lang when the redirect lost ?lang= (TUL-1179)", () => {
  assert.equal(authEmailLocale(R, "es"), "es");
  assert.equal(authEmailLocale(undefined, "es"), "es");
  assert.equal(authEmailLocale("not a url", "es"), "es");
});

test("defaults to English with neither, or junk metadata", () => {
  assert.equal(authEmailLocale(R, undefined), "en");
  assert.equal(authEmailLocale(undefined, 42), "en");
});
