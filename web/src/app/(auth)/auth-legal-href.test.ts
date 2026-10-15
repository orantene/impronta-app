import test from "node:test";
import assert from "node:assert/strict";
import { authLegalHref, authMarketingHref } from "./auth-legal-href";

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

test("TUL-816: marketing links are locale-prefixed on the env marketing origin", () => {
  assert.equal(authMarketingHref("https://staging.tulala.digital/", "/about", "es"), "https://staging.tulala.digital/es/about");
  assert.equal(authMarketingHref("https://staging.tulala.digital", "", "es"), "https://staging.tulala.digital/es");
  assert.equal(authMarketingHref("https://tulala.digital", "/about", "en"), "https://tulala.digital/about");
  assert.equal(authMarketingHref("https://tulala.digital", "", null), "https://tulala.digital");
});
