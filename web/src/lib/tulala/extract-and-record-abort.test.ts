/**
 * TUL-541: a model call that never answers must not hang the onboarding
 * reading step. The extraction aborts the provider request at the wall clock
 * and reports `timeout`, so the caller can retry once or fall back.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

import type { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import type { ChatCompletionInput } from "@/lib/ai/provider";

import type { Brief } from "./brief-store";
import { extractAndRecord, MODEL_TIMEOUT_MS, type ExtractionOutcome } from "./extract-and-record.server";

type Adapter = Awaited<ReturnType<typeof resolveAiChatAdapter>>;

test("a never-resolving model call is aborted at the timeout and reported as timeout", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let seen: AbortSignal | undefined;
    const adapter = {
      id: "anthropic",
      chatCompletion: (input: ChatCompletionInput) => {
        seen = input.signal;
        return new Promise(() => {});
      },
    } as unknown as Adapter;
    let outcome: ExtractionOutcome | null = null;
    const run = extractAndRecord({
      adapter,
      brief: { id: "b1", facts: [] } as unknown as Brief,
      userMessage: "Limpieza de casas en Playa del Carmen",
      question: null,
      pack: null,
      report: (o) => {
        outcome = o;
      },
    });
    await Promise.resolve();
    mock.timers.tick(MODEL_TIMEOUT_MS + 1);
    const learned = await run;
    assert.deepEqual(learned, []);
    assert.equal((outcome as ExtractionOutcome | null)?.code, "timeout");
    assert.ok(seen, "the provider call must receive an AbortSignal");
    assert.equal(seen.aborted, true, "the provider request must be aborted, not left running");
  } finally {
    mock.timers.reset();
  }
});
