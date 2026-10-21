import type {
  AiProviderAdapter,
  ChatCompletionInput,
  ChatCompletionResult,
} from "@/lib/ai/provider";

/** Shown wherever a call is refused because the AI master switch is off (TUL-1622). */
export const AI_OFF_MESSAGE = "AI is turned off for this platform.";

/**
 * Placeholder adapter when the default registry is "none" or unsupported "custom", or when the
 * AI master switch is "off" (no provider is ever called).
 */
export function createDisabledChatAdapter(kind: "none" | "custom" | "off"): AiProviderAdapter {
  return {
    id: "openai",
    async chatCompletion(_input: ChatCompletionInput): Promise<ChatCompletionResult> {
      void _input;
      if (kind === "off") return { ok: false, code: "ai_off", message: AI_OFF_MESSAGE };
      const detail =
        kind === "custom"
          ? "Custom providers are not available yet."
          : "No AI provider is connected.";
      return {
        ok: false,
        code: "no_provider",
        message: `${detail} Connect a provider in AI settings or ask your platform admin.`,
      };
    },
  };
}
