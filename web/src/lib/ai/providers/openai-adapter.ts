import type {
  AiProviderAdapter,
  ChatCompletionInput,
  ChatCompletionResult,
} from "@/lib/ai/provider";

const DEFAULT_MODEL = "gpt-4o-mini";

function modelId(): string {
  return process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * OpenAI chat adapter (structured output via json_schema when provided).
 */
export function createOpenAiChatAdapter(): AiProviderAdapter {
  return {
    id: "openai",
    async chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
      const key = process.env.OPENAI_API_KEY?.trim();
      if (!key) {
        return {
          ok: false,
          code: "no_key",
          message: "OPENAI_API_KEY is not configured.",
        };
      }

      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: key });
        const model = modelId();

        const messages = [
          { role: "system" as const, content: input.systemPrompt },
          { role: "user" as const, content: input.userMessage },
        ];
        const common = {
          model,
          temperature: input.temperature ?? 0.2,
          ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
          messages,
        };

        const completion = input.jsonSchema
          ? await client.chat.completions.create({
              ...common,
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: input.jsonSchema.name,
                  strict: input.jsonSchema.strict ?? true,
                  schema: input.jsonSchema.schema as never,
                },
              },
            })
          : await client.chat.completions.create(common);

        const text = completion.choices[0]?.message?.content?.trim() ?? "";
        if (!text) {
          return {
            ok: false,
            code: "empty_response",
            message: "The model returned no text.",
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
            message: "OpenAI rate limit or quota exceeded.",
          };
        }
        const line =
          typeof err.message === "string" && err.message.trim()
            ? err.message.trim()
            : "OpenAI request failed.";
        return { ok: false, code: "api_error", message: line };
      }
    },
  };
}
