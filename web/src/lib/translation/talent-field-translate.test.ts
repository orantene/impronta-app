import assert from "node:assert/strict";
import { test } from "node:test";

import glossary from "@/i18n/glossary.json";

import {
  TALENT_TRANSLATE_FIELDS,
  buildDailyAiCapQuery,
  buildTalentTranslatePrompt,
  cleanTranslatedText,
  isTalentTranslateField,
  translationCacheKey,
  validateTranslateInput,
} from "./talent-field-translate";

test("cache key is a stable sha256 and ignores whitespace noise", () => {
  const a = translationCacheKey("bio", "es", "en", "Hola  mundo");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, translationCacheKey("bio", "es", "en", "  Hola mundo \r\n"));
  assert.equal(a, translationCacheKey("bio", "ES", "EN", "Hola mundo"));
});

test("cache key changes with field, direction and text", () => {
  const base = translationCacheKey("bio", "es", "en", "Hola");
  assert.notEqual(base, translationCacheKey("tagline", "es", "en", "Hola"));
  assert.notEqual(base, translationCacheKey("bio", "en", "es", "Hola"));
  assert.notEqual(base, translationCacheKey("bio", "es", "fr", "Hola"));
  assert.notEqual(base, translationCacheKey("bio", "es", "en", "Hola!"));
});

test("field allow-list rejects unknown fields and locales", () => {
  assert.equal(isTalentTranslateField("bio"), true);
  assert.equal(isTalentTranslateField("password"), false);
  assert.equal(isTalentTranslateField("toString"), false);
  assert.equal(validateTranslateInput({ field: "nope", from: "es", to: "en", text: "x" }), null);
  assert.equal(validateTranslateInput({ field: "bio", from: "es", to: "it", text: "x" }), null);
  assert.equal(validateTranslateInput({ field: "bio", from: "es", to: "es", text: "x" }), null);
  assert.equal(validateTranslateInput({ field: "bio", from: "es", to: "en", text: "   " }), null);
  assert.equal(Object.keys(TALENT_TRANSLATE_FIELDS).length, 12);
});

test("text is clamped to the field max length", () => {
  const v = validateTranslateInput({ field: "variant_label", from: "es", to: "en", text: "a".repeat(500) });
  assert.ok(v);
  assert.equal(v.text.length, TALENT_TRANSLATE_FIELDS.variant_label.maxLength);
  assert.equal(v.spec.style, "label");
});

test("prompt names both languages, keeps the glossary, and styles by field", () => {
  const p = buildTalentTranslatePrompt({ field: "offering_title", from: "es", to: "de", text: "Corte" });
  assert.match(p.systemPrompt, /from Spanish to German/);
  assert.match(p.systemPrompt, /short label/);
  const terms = (glossary as { protectedTerms: string[] }).protectedTerms;
  for (const term of terms) assert.ok(p.systemPrompt.includes(term), `glossary term ${term} missing`);
  assert.match(p.systemPrompt, /Output only the German translation/);
  assert.equal(p.userMessage, "Corte");
  const para = buildTalentTranslatePrompt({ field: "bio", from: "en", to: "pt", text: "Hi" });
  assert.match(para.systemPrompt, /paragraph/);
  assert.match(para.systemPrompt, /to Portuguese/);
});

test("cleanTranslatedText strips wrapping quotes only", () => {
  assert.equal(cleanTranslatedText('  "Haircut"  '), "Haircut");
  assert.equal(cleanTranslatedText("It's fine"), "It's fine");
});

test("daily cap query counts generate_section rows by scope and talent", () => {
  const q = buildDailyAiCapQuery({ tenantId: "t1", scope: "talent_translate", talentProfileId: "p1", now: new Date("2026-09-29T15:30:00Z") });
  assert.equal(q.table, "cms_ai_usage_log");
  assert.deepEqual(q.eq, [["tenant_id", "t1"], ["action", "generate_section"]]);
  assert.deepEqual(q.contains, { column: "context_jsonb", value: { scope: "talent_translate", talent_profile_id: "p1" } });
  assert.equal(q.gteCreatedAt, "2026-09-29T00:00:00.000Z");
  const noTalent = buildDailyAiCapQuery({ tenantId: "t1", scope: "writing_helper" });
  assert.deepEqual(noTalent.contains.value, { scope: "writing_helper" });
});
