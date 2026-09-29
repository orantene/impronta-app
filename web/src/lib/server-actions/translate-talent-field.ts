"use server";

/**
 * Talent per-field AI translate (PR 6). The signed-in talent translates one of
 * their own field values between site languages. Cache first (zero AI calls on
 * an unchanged input), then gates, then one routed "helper" call. The result
 * is a draft only; the caller's screen saves it.
 *
 * Returns codes, not copy: the UI maps them to EN/ES strings.
 */

import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import { resolveRoutedChat } from "@/lib/ai/call-routing.server";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { readTalentTranslationCache, writeTalentTranslationCache } from "@/lib/translation/talent-translation-cache.server";
import { selfFacts, underDailyCap } from "@/lib/talent/bio-helper.server";
import {
  buildTalentTranslatePrompt,
  cleanTranslatedText,
  TALENT_TRANSLATE_DAILY_CAP,
  TALENT_TRANSLATE_SCOPE,
  translationCacheKey,
  validateTranslateInput,
  type TalentTranslateField,
  type TalentTranslateLocale,
} from "@/lib/translation/talent-field-translate";

export type TranslateTalentFieldInput = {
  field: TalentTranslateField;
  from: TalentTranslateLocale;
  to: TalentTranslateLocale;
  text: string;
};

export type TranslateTalentFieldErrorCode = "no_key" | "disabled" | "quota" | "rate_limit" | "invalid" | "error";

export type TranslateTalentFieldResult =
  | { ok: true; text: string; cached: boolean }
  | { ok: false; code: TranslateTalentFieldErrorCode; message: string };

function fail(code: TranslateTalentFieldErrorCode, message: string): TranslateTalentFieldResult {
  return { ok: false, code, message };
}

export async function translateTalentField(input: TranslateTalentFieldInput): Promise<TranslateTalentFieldResult> {
  const v = validateTranslateInput(input ?? { field: null, from: null, to: null, text: null });
  if (!v) return fail("invalid", "Invalid translate request.");

  const self = await selfFacts();
  if (!self) return fail("invalid", "Not signed in as a talent.");

  const hash = translationCacheKey(v.field, v.from, v.to, v.text);

  const hit = await readTalentTranslationCache(hash);
  if (hit) return { ok: true, text: hit, cached: true };

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_talent_translate_enabled) return fail("disabled", "AI translation is turned off.");
  if (!(await isResolvedAiChatConfigured())) return fail("no_key", "No AI provider is configured.");

  const tenantId = self.tenantId ?? DEFAULT_AI_TENANT_ID;
  const gate = await assertAiInvocationAllowed(tenantId);
  if (!gate.ok) return fail(gate.code === "rate_limit" ? "rate_limit" : "quota", gate.message);
  if (!(await underDailyCap(tenantId, { scope: TALENT_TRANSLATE_SCOPE, talentProfileId: self.id, cap: TALENT_TRANSLATE_DAILY_CAP }))) {
    return fail("quota", "Daily AI translation limit reached.");
  }

  const { adapter, model } = await resolveRoutedChat("helper");
  const prompt = buildTalentTranslatePrompt(v);
  const t0 = Date.now();
  let result: Awaited<ReturnType<typeof adapter.chatCompletion>>;
  try {
    result = await adapter.chatCompletion({ ...prompt, temperature: 0.2, maxTokens: v.spec.maxTokens, model });
  } catch (err) {
    logServerError("talentTranslate.call", err);
    result = { ok: false, code: "api_error", message: "Translation request failed." };
  }
  const usedModel = result.ok ? (result.model ?? model ?? "auto") : (model ?? "auto");
  void recordAiGenerationUsage({
    provider: adapter.id,
    model: usedModel,
    usage: result.ok ? result.usage : undefined,
    actorProfileId: null,
    ok: result.ok,
    scope: TALENT_TRANSLATE_SCOPE,
    latencyMs: Date.now() - t0,
    tenantId,
    context: { talent_profile_id: self.id, field: v.field, from: v.from, to: v.to },
  }).catch((err) => logServerError("talentTranslate.usage", err));

  if (!result.ok) {
    if (result.code === "no_key") return fail("no_key", result.message);
    if (result.code === "quota") return fail("quota", result.message);
    if (result.code === "rate_limit") return fail("rate_limit", result.message);
    return fail("error", result.message || "Translation request failed.");
  }
  const text = cleanTranslatedText(result.text);
  if (!text) return fail("error", "The model returned no text.");

  await writeTalentTranslationCache({ hash, field: v.field, from_locale: v.from, to_locale: v.to, source_text: v.text, target_text: text, model: usedModel });
  return { ok: true, text, cached: false };
}
