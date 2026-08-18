import assert from "node:assert/strict";
import { test } from "node:test";

import { i18nCopy, pickI18n } from "./i18n-text";

test("i18nCopy still parses a plain string within max", () => {
  const schema = i18nCopy(140, { min: 1 });
  assert.equal(schema.parse("Hello"), "Hello");
});

test("i18nCopy rejects a plain string over max (does not inherit i18nString's 20k)", () => {
  const schema = i18nCopy(10);
  assert.equal(schema.safeParse("abcdefghijk").success, false);
});

test("i18nCopy accepts a locale map and pickI18n resolves the active locale", () => {
  const schema = i18nCopy(140, { min: 1 });
  const parsed = schema.parse({ en: "Hello", es: "Hola" });
  assert.equal(pickI18n(parsed, "es"), "Hola");
  assert.equal(pickI18n(parsed, "en"), "Hello");
});

test("i18nCopy locale-map values are clamped to the same max as the string branch", () => {
  const schema = i18nCopy(8);
  assert.equal(schema.safeParse({ es: "toolonggg" }).success, false);
});
