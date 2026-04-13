import glossary from "@/i18n/glossary.json";

const MODEL = "gpt-4o-mini";

export type BioTranslateFailureCode = "no_key" | "quota" | "api_error" | "empty_response";

export type BioTranslateResult =
  | { ok: true; text: string }
  | { ok: false; code: BioTranslateFailureCode; message: string };

/** Shared with short-label translation (taxonomy, locations). */
export function glossaryPromptBlock(): string {
  const terms = (glossary as { protectedTerms: string[] }).protectedTerms;
  return `Keep these brand/product terms unchanged (do not translate): ${terms.join(", ")}.`;
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Translate EN bio → ES via OpenAI. Never throws; maps SDK/network failures to {@link BioTranslateResult}.
 */
export async function translateBioEnToEs(text: string): Promise<BioTranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: "" };
  }

  if (!isOpenAiConfigured()) {
    return {
      ok: false,
      code: "no_key",
      message: "OpenAI is not configured (missing OPENAI_API_KEY). Add a key or translate manually.",
    };
  }

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You translate short professional talent bios from English to Spanish for a fashion/modeling agency site. ${glossaryPromptBlock()} Output only the Spanish translation, no quotes or preamble.`,
        },
        { role: "user", content: trimmed },
      ],
      temperature: 0.3,
    });

    const out = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!out) {
      return {
        ok: false,
        code: "empty_response",
        message: "The model returned no text. Try again or translate manually.",
      };
    }
    return { ok: true, text: out };
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    const status = typeof err.status === "number" ? err.status : undefined;
    if (status === 429) {
      return {
        ok: false,
        code: "quota",
        message: "OpenAI rate limit or quota exceeded. Try again later or translate manually.",
      };
    }
    const line =
      typeof err.message === "string" && err.message.trim()
        ? err.message.trim()
        : "Translation request failed.";
    return {
      ok: false,
      code: "api_error",
      message: line,
    };
  }
}
