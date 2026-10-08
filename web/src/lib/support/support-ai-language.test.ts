import assert from "node:assert/strict";
import { test } from "node:test";

import {
  supportAiLanguageDirective,
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
  assert.match(d, /same language as the requester's latest message/);
  assert.match(d, /answer in Spanish/);
});
