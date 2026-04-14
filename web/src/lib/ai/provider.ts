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
  /** When set, OpenAI uses response_format json_schema; Claude gets schema in the prompt. */
  jsonSchema?: JsonSchemaForChat;
};

export type ChatCompletionResult =
  | { ok: true; text: string }
  | { ok: false; code: string; message: string };

export type AiProviderAdapter = {
  id: AiProviderId;
  chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult>;
};
