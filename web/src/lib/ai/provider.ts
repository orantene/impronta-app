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
  /**
   * Opt into adaptive extended thinking for this call (quality lift on
   * structure-/taste-sensitive work like page generation). Only honored by the
   * Anthropic adapter, and only on the adaptive-capable model family
   * (opus-4-8/4-7, sonnet-5, fable-5/mythos-5); ignored otherwise. Thinking
   * tokens count toward `maxTokens`, so give headroom. The response's text block
   * is still extracted normally (thinking blocks are skipped).
   */
  /**
   * `true` opts into adaptive thinking. `false` explicitly DISABLES it.
   * `undefined` leaves the provider default alone.
   *
   * The three states matter because Sonnet 5 thinks by DEFAULT, so "did not ask
   * for thinking" and "asked for no thinking" are different requests. Measured
   * on the guest support call: 238 of 434 output tokens were thinking the
   * caller never requested, and disabling it halved the call.
   */
  thinking?: boolean;
  /**
   * Reasoning effort for the adaptive-thinking model family (AIQ-14). Only the
   * Anthropic adapter honors it, only on the adaptive-capable models, and only
   * via an untyped request-body field (`output_config.effort`) the pinned ^0.39
   * SDK types don't expose. Ignored elsewhere. Pairs with `thinking`.
   */
  effort?: "low" | "medium" | "high" | "xhigh";
};

/** Token usage returned by a provider, when available. */
export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ChatCompletionResult =
  | {
      ok: true;
      text: string;
      usage?: AiUsage;
      model?: string;
      /** Raw provider stop reason ("max_tokens" = truncated). Anthropic only; null when unknown (AIQ-15). */
      stopReason?: string | null;
    }
  | { ok: false; code: string; message: string };

/**
 * A single beat of a streamed completion.
 *
 * `done` always carries the full accumulated text, so a caller that only needs
 * the final answer can ignore every `text` event and still be correct. That
 * matters because the fallback path (an adapter with no streaming) synthesises
 * exactly one `done`, and no call site should have to special-case it.
 */
export type ChatStreamEvent =
  | { type: "text"; delta: string }
  | {
      type: "done";
      text: string;
      usage?: AiUsage;
      model?: string;
      stopReason?: string | null;
    }
  | { type: "error"; code: string; message: string };

export type AiProviderAdapter = {
  id: AiProviderId;
  chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult>;
  /**
   * OPTIONAL. Streamed text for conversational surfaces, where a four-second
   * silence reads as broken even when the answer is good.
   *
   * Optional rather than required so adding it did not force a rewrite of the
   * disabled adapter or of OpenAI. Callers must handle absence — use
   * `streamOrFallback` in `stream.ts` rather than testing for the method at
   * every call site.
   *
   * Never use this for structured extraction. A half-streamed JSON object is
   * unparseable, so schema'd calls stay on `chatCompletion`.
   */
  streamChatCompletion?(input: ChatCompletionInput): AsyncIterable<ChatStreamEvent>;
};
