import "server-only";

/**
 * One extraction turn: the person's words → facts with provenance, recorded
 * on the brief. Lifted verbatim from `turn.server.ts` (the chat intake) so the
 * onboarding module's single-shot understand step runs the exact same prompt,
 * schema, parser and refusals; both callers import it from here.
 */

import type { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";

import type { Brief } from "./brief-store";
import { recordFacts } from "./brief-store.server";
import { EXTRACTION_SCHEMA, parseExtraction } from "./extraction";
import { normalizeExtractedFacts } from "./normalize-facts";
import type { IndustryPack } from "./industry-packs";
import { buildExtractionMessage, buildExtractionPrompt } from "./prompts";
import type { Question } from "./questions";
import { withTimeout } from "./with-timeout";

export type LearnedFact = { factKey: string; value: unknown; confidence: number };

/** Tokens for the extraction payload. */
export const EXTRACTION_MAX_TOKENS = 1200;

/** Wall clock per model call. Past this the visitor has given up anyway. */
export const MODEL_TIMEOUT_MS = 20_000;

export async function extractAndRecord(input: {
  adapter: Awaited<ReturnType<typeof resolveAiChatAdapter>>;
  brief: Brief;
  userMessage: string;
  question: Question | null;
  pack: IndustryPack | null;
}): Promise<LearnedFact[]> {
  try {
    const completion = await withTimeout(
      input.adapter.chatCompletion({
        systemPrompt: buildExtractionPrompt({ pack: input.pack }),
        userMessage: buildExtractionMessage({
          userMessage: input.userMessage,
          brief: input.brief,
          question: input.question,
        }),
        jsonSchema: EXTRACTION_SCHEMA,
        maxTokens: EXTRACTION_MAX_TOKENS,
        temperature: 0,
      }),
      MODEL_TIMEOUT_MS,
      { ok: false as const, code: "timeout", message: "Extraction timed out." },
    );

    if (!completion.ok) {
      logServerError("tulala.extract", new Error(completion.code));
      return [];
    }

    const parsed = parseExtraction(completion.text, {
      questionId: input.question?.id ?? null,
      questionVersion: input.question?.version ?? null,
      // Belt and braces on the physical-attribute rule. The prompt withholds
      // those keys, but a model that produces one anyway — from its own priors,
      // or because a previous turn's context leaked — must still be refused.
      // Two independent barriers, because the failure is unrecoverable: nobody
      // can un-store a description of somebody's body.
      allowPhysicalAttributes: input.pack?.id === "model",
    });

    if (parsed.parseFailed) {
      // Worth a log line: a malformed payload is a prompt or model problem, and
      // it is silent from the outside because the turn still completes.
      logServerError("tulala.extract.parse", new Error("unparseable extraction payload"));
      return [];
    }
    if (parsed.facts.length === 0) return [];

    // Shape before store: hours to one canonical form, phones to E.164 when
    // the country is known, service lists tidy. The model reads; this shapes.
    const facts = normalizeExtractedFacts(parsed.facts);
    const result = await recordFacts(input.brief.id, facts);
    const written = new Set(result.written);
    return facts
      .filter((f) => written.has(f.factKey))
      .map((f) => ({
        factKey: f.factKey,
        value: f.value,
        confidence: f.confidence ?? 0.5,
      }));
  } catch (err) {
    // A failed extraction costs one question's worth of progress. Failing the
    // whole turn over it would cost the customer.
    logServerError("tulala.extract.unexpected", err);
    return [];
  }
}
