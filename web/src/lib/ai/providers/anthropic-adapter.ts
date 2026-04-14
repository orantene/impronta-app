import Anthropic from "@anthropic-ai/sdk";

import type {
  AiProviderAdapter,
  ChatCompletionInput,
  ChatCompletionResult,
} from "@/lib/ai/provider";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function modelId(): string {
  return process.env.ANTHROPIC_CHAT_MODEL?.trim() || DEFAULT_MODEL;
}

function schemaInstruction(jsonSchema?: ChatCompletionInput["jsonSchema"]): string {
  if (!jsonSchema) return "";
  return [
    "",
    "CRITICAL: Respond with a single JSON object only (no markdown, no code fences).",
    "The JSON must conform to this schema (field names and types must match):",
    JSON.stringify(jsonSchema.schema, null, 0),
  ].join("\n");
}

/**
 * Anthropic (Claude) chat adapter. Structured output is prompt-enforced + JSON parse.
 */
export function createAnthropicChatAdapter(): AiProviderAdapter {
  return {
    id: "anthropic",
    async chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
      const key = process.env.ANTHROPIC_API_KEY?.trim();
      if (!key) {
        return {
          ok: false,
          code: "no_key",
          message: "ANTHROPIC_API_KEY is not configured.",
        };
      }

      const systemWithSchema =
        input.systemPrompt + schemaInstruction(input.jsonSchema);

      try {
        const client = new Anthropic({ apiKey: key });
        const msg = await client.messages.create({
          model: modelId(),
          max_tokens: input.maxTokens ?? 4096,
          temperature: input.temperature ?? 0.2,
          system: systemWithSchema,
          messages: [{ role: "user", content: input.userMessage }],
        });

        const block = msg.content.find((b) => b.type === "text");
        const text =
          block && block.type === "text" ? block.text.trim() : "";
        if (!text) {
          return {
            ok: false,
            code: "empty_response",
            message: "Claude returned no text.",
          };
        }
        return { ok: true, text };
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        const status = typeof err.status === "number" ? err.status : undefined;
        if (status === 429) {
          return {
            ok: false,
            code: "quota",
            message: "Anthropic rate limit or quota exceeded.",
          };
        }
        const line =
          typeof err.message === "string" && err.message.trim()
            ? err.message.trim()
            : "Anthropic request failed.";
        return { ok: false, code: "api_error", message: line };
      }
    },
  };
}
