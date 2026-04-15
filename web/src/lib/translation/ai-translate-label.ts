import { resolveAiChatAdapter, isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { glossaryPromptBlock } from "@/lib/translation/ai-translate-bio";

export type LabelTranslateFailureCode = "no_key" | "quota" | "api_error" | "empty_response";

export type LabelTranslateResult =
  | { ok: true; text: string }
  | { ok: false; code: LabelTranslateFailureCode; message: string };

/**
 * Translate short directory labels (taxonomy terms, city names) EN → ES.
 * Reuses glossary protected terms. Never throws.
 */
export async function translateDirectoryLabelEnToEs(text: string): Promise<LabelTranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: "" };
  }

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_translations_enabled) {
    return {
      ok: false,
      code: "no_key",
      message:
        "AI translations are off in AI settings (or master AI is off). Enable them under Admin → AI settings, or translate manually.",
    };
  }

  if (!(await isResolvedAiChatConfigured())) {
    return {
      ok: false,
      code: "no_key",
      message:
        "No AI provider is connected with a valid key. Configure a provider in Admin → AI settings, or translate manually.",
    };
  }

  const adapter = await resolveAiChatAdapter();
  const result = await adapter.chatCompletion({
    systemPrompt: `You translate short English UI labels, taxonomy terms, and place names into natural Spanish for a fashion/modeling agency directory. ${glossaryPromptBlock()} Output only the Spanish text, no quotes or explanation.`,
    userMessage: trimmed,
    temperature: 0.2,
  });

  if (!result.ok) {
    if (result.code === "quota") {
      return {
        ok: false,
        code: "quota",
        message: "AI rate limit or quota exceeded. Try again later or translate manually.",
      };
    }
    if (result.code === "no_key") {
      return {
        ok: false,
        code: "no_key",
        message: result.message,
      };
    }
    return {
      ok: false,
      code: "api_error",
      message: result.message || "Translation request failed.",
    };
  }

  const out = result.text.trim();
  if (!out) {
    return {
      ok: false,
      code: "empty_response",
      message: "The model returned no text. Try again or translate manually.",
    };
  }
  return { ok: true, text: out };
}
