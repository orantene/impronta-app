import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  supportAiLanguageDirective,
  resolveSupportAiLocale,
  supportAiLanguageName,
} from "./support-ai-language";

test("maps locales to language names, defaulting to English", () => {
  assert.equal(supportAiLanguageName("es"), "Spanish");
  assert.equal(supportAiLanguageName("es-MX"), "Spanish");
  assert.equal(supportAiLanguageName("en"), "English");
  assert.equal(supportAiLanguageName(null), "English");
  assert.equal(supportAiLanguageName("xx"), "English");
});

test("directive follows the message and falls back to the app locale", () => {
  const d = supportAiLanguageDirective("es");
  assert.match(d, /Never reply in English/);
  assert.match(d, /Spanish/);
});

test("panel locale beats the request locale (API routes carry no locale prefix)", () => {
  assert.equal(resolveSupportAiLocale("es", "en"), "es");
  assert.equal(resolveSupportAiLocale("es-MX", "en"), "es");
  assert.equal(resolveSupportAiLocale(undefined, "es"), "es");
  assert.equal(resolveSupportAiLocale("zz", "es"), "es");
  assert.equal(resolveSupportAiLocale(null, null), "en");
});

test("Spanish UI gets an explicit reply-in-Spanish instruction", () => {
  const d = supportAiLanguageDirective("es");
  assert.match(d, /Reply in Spanish/);
  assert.match(d, /Never reply in English/);
  assert.doesNotMatch(supportAiLanguageDirective("en"), /Reply in Spanish/);
});

test("the route reads the client locale", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/ai/support-chat/route.ts"), "utf8");
  assert.match(route, /locale: z\.string\(\)/);
  assert.match(route, /resolveSupportAiLocale\(parsed\.data\.locale/);
});
