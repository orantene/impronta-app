import { glossaryPromptBlock, isOpenAiConfigured } from "@/lib/translation/ai-translate-bio";

const MODEL = "gpt-4o-mini";

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
          content: `You translate short English UI labels, taxonomy terms, and place names into natural Spanish for a fashion/modeling agency directory. ${glossaryPromptBlock()} Output only the Spanish text, no quotes or explanation.`,
        },
        { role: "user", content: trimmed },
      ],
      temperature: 0.2,
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
