import { glossaryPromptBlock } from "@/lib/translation/glossary-prompt";
import {
  isResolvedAiChatConfigured,
  resolveAiChatAdapter,
} from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { gateAiCall, meterAiCall } from "@/lib/ai/metered-ai";

export type BioTranslateFailureCode = "no_key" | "quota" | "api_error" | "empty_response";

export type BioTranslateResult =
  | { ok: true; text: string }
  | { ok: false; code: BioTranslateFailureCode; message: string };

/** Shared with short-label translation (taxonomy, locations). Lives in the pure `glossary-prompt` module. */
export { glossaryPromptBlock };

/**
 * @deprecated Use {@link isResolvedAiChatConfigured} (async). Kept for rare sync checks: true if any provider key exists.
 */
export function isOpenAiConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim(),
  );
}

/**
 * Translate EN bio → ES via configured chat provider. Never throws.
 */
/**
 * `opts.tenantId`: the workspace the translation is done for (TUL-1623); omitted = platform-level work, billed to the platform.
 */
export async function translateBioEnToEs(text: string, opts: { tenantId?: string | null } = {}): Promise<BioTranslateResult> {
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

  // TUL-1623: gated and metered against the workspace it was done for (the platform tenant when there is none).
  const gate = await gateAiCall(opts.tenantId);
  if (!gate.ok) return { ok: false, code: "quota", message: gate.error };
  const adapter = await resolveAiChatAdapter();
  const startedAt = Date.now();
  const result = await adapter.chatCompletion({
    systemPrompt: `You translate short professional talent bios from English to Spanish for a fashion/modeling agency site. ${glossaryPromptBlock()} Output only the Spanish translation, no quotes or preamble.`,
    userMessage: trimmed,
    temperature: 0.3,
  });
  meterAiCall({ tenantId: opts.tenantId, feature: "translate_bio_en_es", provider: adapter.id, model: null, result, startedAt });

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
