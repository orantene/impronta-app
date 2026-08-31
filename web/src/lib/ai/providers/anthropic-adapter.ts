import Anthropic from "@anthropic-ai/sdk";

import type {
  AiProviderAdapter,
  ChatCompletionInput,
  ChatCompletionResult,
  ChatStreamEvent,
} from "@/lib/ai/provider";
import { logServerError } from "@/lib/server/safe-error";

// Sonnet 4 (claude-sonnet-4-20250514) was RETIRED by Anthropic — the API now
// 404s on it, which silently killed every default-model chat path (guest
// message extraction, inquiry drafts) because they all fail open. Pin the
// current Sonnet family default instead; ANTHROPIC_CHAT_MODEL still overrides.
const DEFAULT_MODEL = "claude-sonnet-5";

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

/**
 * The same model family that dropped sampling params is the one that supports
 * ADAPTIVE thinking (`thinking: {type: "adaptive"}`). Older models take
 * `{type: "enabled", budget_tokens}` instead, so we only opt into adaptive here
 * (and leave thinking off elsewhere) to avoid a 400.
 */
function modelSupportsAdaptiveThinking(model: string): boolean {
  return modelRejectsSamplingParams(model);
}

/**
 * True when the served model is a genuinely different family than requested
 * (AIQ-31). A snapshot suffix (requested `claude-opus-4-8`, served
 * `claude-opus-4-8-20260115`) is NOT drift; only a family change (served
 * `claude-sonnet-...`) is. Bidirectional startsWith covers alias↔snapshot both ways.
 */
export function isModelDrift(requested: string, served: string): boolean {
  return Boolean(served) && !served.startsWith(requested) && !requested.startsWith(served);
}

/**
 * Build the Anthropic request params (extracted so the cache/effort/thinking
 * shaping is unit-testable without a live call). `output_config.effort` (AIQ-14)
 * is set via a cast — the ^0.39 SDK predates the field but the API honors it;
 * both effort and adaptive thinking are gated to the model family that accepts
 * them so other callers/models never 400. The system block is cache-marked so
 * repeat/retry generations reuse the static prefix at ~10% input cost (AIQ-22);
 * the marker is a safe no-op when the prefix is below a tier's cache minimum.
 */
export function buildAnthropicParams(
  input: ChatCompletionInput,
  model: string,
  systemWithSchema: string,
): Anthropic.MessageCreateParamsNonStreaming {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: input.maxTokens ?? 4096,
    system: [{ type: "text", text: systemWithSchema, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: input.userMessage }],
  };
  if (!modelRejectsSamplingParams(model)) {
    params.temperature = input.temperature ?? 0.2;
  }
  if (input.thinking && modelSupportsAdaptiveThinking(model)) {
    (params as unknown as { thinking?: unknown }).thinking = { type: "adaptive" };
  }
  if (input.effort && modelSupportsAdaptiveThinking(model)) {
    (params as unknown as { output_config?: { effort?: string } }).output_config = {
      effort: input.effort,
    };
  }
  return params;
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
        const params = buildAnthropicParams(input, model, systemWithSchema);
        const msg = await client.messages.create(params);

        const block = msg.content.find((b) => b.type === "text");
        const text =
          block && block.type === "text" ? block.text.trim() : "";
        if (!text) {
          // A truncated response (thinking spent the whole budget before any
          // text) is distinct from a hard empty — the orchestrator can raise the
          // cap and retry rather than dropping to the preset fallback (AIQ-15).
          const truncated = msg.stop_reason === "max_tokens";
          return {
            ok: false,
            code: truncated ? "truncated" : "empty_response",
            message: truncated
              ? "Claude hit the token cap before emitting text."
              : "Claude returned no text.",
          };
        }
        // AIQ-31 — log (never fail) when the served snapshot is a different
        // family than requested, so usage/quality attribution stays honest.
        const served = msg.model ?? "";
        if (isModelDrift(model, served)) {
          logServerError(
            "anthropic-adapter/model-drift",
            new Error(`requested "${model}" but served "${served}"`),
          );
        }
        return {
          ok: true,
          text,
          model: served || model, // served id → accurate usage dashboard (AIQ-31)
          stopReason: msg.stop_reason, // "max_tokens" ⇒ truncated (AIQ-15)
          usage: {
            inputTokens: msg.usage?.input_tokens ?? null,
            outputTokens: msg.usage?.output_tokens ?? null,
          },
        };
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

    /**
     * Streamed text, for conversational surfaces only.
     *
     * Reuses `buildAnthropicParams` so the model-family shaping (no sampling
     * params on Sonnet 5+, adaptive thinking, effort, prompt caching) cannot
     * drift between the streaming and non-streaming paths — that divergence
     * would show up as a 400 on one path only, which is a miserable bug to find.
     *
     * Errors are YIELDED, not thrown: a stream that throws mid-flight after the
     * client has already rendered half a sentence leaves the UI with no way to
     * say what went wrong.
     */
    async *streamChatCompletion(
      input: ChatCompletionInput,
    ): AsyncIterable<ChatStreamEvent> {
      const key = apiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
      if (!key) {
        yield { type: "error", code: "no_key", message: "Anthropic API key is not configured." };
        return;
      }

      const model = modelId(input.model);
      let accumulated = "";

      try {
        const client = new Anthropic({ apiKey: key });
        const params = buildAnthropicParams(input, model, input.systemPrompt);
        const stream = client.messages.stream({ ...params, stream: true });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta" &&
            event.delta.text
          ) {
            accumulated += event.delta.text;
            yield { type: "text", delta: event.delta.text };
          }
        }

        const final = await stream.finalMessage();
        const served = final.model ?? "";
        if (isModelDrift(model, served)) {
          logServerError(
            "anthropic-adapter/model-drift",
            new Error(`requested "${model}" but served "${served}"`),
          );
        }

        const text = accumulated.trim();
        if (!text) {
          yield {
            type: "error",
            code: final.stop_reason === "max_tokens" ? "truncated" : "empty_response",
            message: "Claude returned no text.",
          };
          return;
        }

        yield {
          type: "done",
          text,
          model: served || model,
          stopReason: final.stop_reason,
          usage: {
            inputTokens: final.usage?.input_tokens ?? null,
            outputTokens: final.usage?.output_tokens ?? null,
          },
        };
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        const status = typeof err.status === "number" ? err.status : undefined;
        yield {
          type: "error",
          code: status === 429 ? "quota" : "api_error",
          message:
            typeof err.message === "string" && err.message.trim()
              ? err.message.trim()
              : "Anthropic stream failed.",
        };
      }
    },
  };
}
