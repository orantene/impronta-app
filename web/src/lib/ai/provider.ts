/**
 * AI chat provider abstraction. Embeddings stay OpenAI-only (see openai-embeddings.ts).
 */

export type AiProviderId = "openai" | "anthropic";

/** JSON Schema envelope for structured outputs (OpenAI native; Anthropic via prompt). */
export type JsonSchemaForChat = {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
};

export type ChatCompletionInput = {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Per-call model override. Lets one feature pin a specific model (e.g. the
   * builder generator on `claude-opus-4-8`) without repurposing the shared
   * chat default other call sites rely on. Falls back to the adapter's env
   * default (`ANTHROPIC_CHAT_MODEL` / `OPENAI_CHAT_MODEL`) when unset.
   */
  model?: string;
  /** When set, OpenAI uses response_format json_schema; Claude gets schema in the prompt. */
  jsonSchema?: JsonSchemaForChat;
};

/** Token usage returned by a provider, when available. */
export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ChatCompletionResult =
  | { ok: true; text: string; usage?: AiUsage; model?: string }
  | { ok: false; code: string; message: string };

export type AiProviderAdapter = {
  id: AiProviderId;
  chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult>;
};
