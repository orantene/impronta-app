import type {
  AiProviderAdapter,
  ChatCompletionInput,
  ChatCompletionResult,
} from "@/lib/ai/provider";

/**
 * Placeholder adapter when the default registry is "none" or unsupported "custom".
 */
export function createDisabledChatAdapter(kind: "none" | "custom"): AiProviderAdapter {
  return {
    id: "openai",
    async chatCompletion(_input: ChatCompletionInput): Promise<ChatCompletionResult> {
      void _input;
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
