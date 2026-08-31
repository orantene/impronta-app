/**
 * stream.ts — streaming helpers shared by any conversational AI surface.
 *
 * Two jobs, both about not repeating a subtle thing at every call site:
 *
 *   1. `streamOrFallback` — makes `streamChatCompletion` look mandatory even
 *      though it is optional. A route that tests for the method itself will
 *      eventually get the fallback wrong, and the failure mode (silence instead
 *      of a reply) is invisible in tests that stub a streaming adapter.
 *   2. `sseResponse` — one SSE framing. Hand-rolled `data: ` lines drift on
 *      exactly the details that break in production: the double newline, the
 *      buffering headers, and flushing before the client gives up.
 *
 * No new dependency: `ReadableStream` and `TextEncoder` are platform.
 */

import type {
  AiProviderAdapter,
  ChatCompletionInput,
  ChatStreamEvent,
} from "@/lib/ai/provider";

/**
 * Stream when the adapter can, otherwise emit the non-streaming result as a
 * single beat.
 *
 * The fallback is genuinely correct rather than degraded: `done` always carries
 * the full text, so a consumer that renders on `done` behaves identically on
 * both paths. It just arrives all at once.
 */
export async function* streamOrFallback(
  adapter: AiProviderAdapter,
  input: ChatCompletionInput,
): AsyncIterable<ChatStreamEvent> {
  if (typeof adapter.streamChatCompletion === "function") {
    yield* adapter.streamChatCompletion(input);
    return;
  }

  const result = await adapter.chatCompletion(input);
  if (!result.ok) {
    yield { type: "error", code: result.code, message: result.message };
    return;
  }
  yield { type: "text", delta: result.text };
  yield {
    type: "done",
    text: result.text,
    usage: result.usage,
    model: result.model,
    stopReason: result.stopReason ?? null,
  };
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

export type SseFrame = { event: string; data: unknown };

/** One frame. `data` is always JSON so the client never sniffs the payload. */
export function encodeSseFrame(frame: SseFrame): string {
  return `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
}

/**
 * Wrap an async generator of frames in a streaming Response.
 *
 * The headers are all load-bearing:
 *   - `no-transform` and `X-Accel-Buffering: no` stop an intermediary from
 *     buffering the whole body, which turns a stream back into one slow reply
 *     and is the single most common way SSE "works locally, not in prod".
 *   - `Connection: keep-alive` for HTTP/1.1 hops.
 *
 * Generator errors are converted into a final `error` frame rather than
 * destroying the stream, so the client shows a message instead of hanging.
 */
export function sseResponse(
  frames: () => AsyncIterable<SseFrame>,
  init: { status?: number } = {},
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const frame of frames()) {
          controller.enqueue(encoder.encode(encodeSseFrame(frame)));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            encodeSseFrame({
              event: "error",
              // Deliberately not the thrown message: this reaches an anonymous
              // visitor, and an unmasked internal error is an information leak.
              data: { code: "stream_failed", message: "The connection dropped." },
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
