import Anthropic from "@anthropic-ai/sdk";

import type {
  AiProviderAdapter,
  ChatCompletionInput,
  ChatCompletionResult,
} from "@/lib/ai/provider";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/** Per-call override wins, then the env default, then the module default. */
function modelId(override?: string): string {
  return override?.trim() || process.env.ANTHROPIC_CHAT_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * The Opus 4.7+ / Sonnet 5 / Fable 5 family REMOVED the sampling parameters —
 * sending `temperature` / `top_p` / `top_k` returns a 400. Older models (incl.
 * the current default and Opus/Sonnet 4.6 and earlier) still accept them. We
 * therefore only send `temperature` when the resolved model accepts it, so a
 * caller pinning e.g. `claude-opus-4-8` (the builder generator) does not 400.
 */
function modelRejectsSamplingParams(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.startsWith("claude-opus-4-8") ||
    m.startsWith("claude-opus-4-7") ||
    m.startsWith("claude-sonnet-5") ||
    m.startsWith("claude-fable-5") ||
    m.startsWith("claude-mythos-5")
  );
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
 * Pass `apiKey` from the encrypted registry; otherwise falls back to `ANTHROPIC_API_KEY`.
 */
export function createAnthropicChatAdapter(apiKey?: string | null): AiProviderAdapter {
  return {
    id: "anthropic",
    async chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
      const key = apiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
      if (!key) {
        return {
          ok: false,
          code: "no_key",
          message: "Anthropic API key is not configured.",
        };
      }

      const systemWithSchema =
        input.systemPrompt + schemaInstruction(input.jsonSchema);

      try {
        const client = new Anthropic({ apiKey: key });
        const model = modelId(input.model);
        const params: Anthropic.MessageCreateParamsNonStreaming = {
          model,
          max_tokens: input.maxTokens ?? 4096,
          system: systemWithSchema,
          messages: [{ role: "user", content: input.userMessage }],
        };
        // Only the pre-4.7 models accept sampling params; the 4.7+/5 family 400s.
        if (!modelRejectsSamplingParams(model)) {
          params.temperature = input.temperature ?? 0.2;
        }
        const msg = await client.messages.create(params);

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
