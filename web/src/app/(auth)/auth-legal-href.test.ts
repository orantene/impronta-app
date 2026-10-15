import test from "node:test";
import assert from "node:assert/strict";
import { authLegalHref } from "./auth-legal-href";

test("default locale stays unprefixed on the platform host", () => {
  assert.equal(authLegalHref("https://tulala.digital", "terms", "en"), "https://tulala.digital/legal/terms");
  assert.equal(authLegalHref("https://tulala.digital/", "privacy", undefined), "https://tulala.digital/legal/privacy");
});

test("Spanish login links the Spanish legal pages", () => {
  assert.equal(authLegalHref("https://tulala.digital", "terms", "es"), "https://tulala.digital/es/legal/terms");
  assert.equal(authLegalHref("https://tulala.digital", "privacy", "ES"), "https://tulala.digital/es/legal/privacy");
});

test("junk locale falls back to unprefixed", () => {
  assert.equal(authLegalHref("https://tulala.digital", "terms", "../x"), "https://tulala.digital/legal/terms");
});
