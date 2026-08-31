/**
 * turn.server.ts — one conversational turn, orchestrated.
 *
 * Everything IO in a turn happens here, in a fixed order, so the route handler
 * stays a transport shell and the ordering itself is reviewable in one place.
 *
 * WHY TWO MODEL CALLS
 * ───────────────────
 * Extraction is structured and must be validated, so it cannot stream — a
 * half-arrived JSON object is unparseable. The reply must stream, because four
 * seconds of silence in a chat reads as broken even when the answer is good.
 * Those are incompatible requirements, so they are two calls:
 *
 *   1. EXTRACT (structured, awaited) → facts recorded → panel updated
 *   2. REPLY   (streamed)            → prose
 *
 * The order is a feature, not just a constraint. The "What I know" panel updates
 * BEFORE the reply finishes typing, so the visible receipt of being understood
 * arrives first. The cost is one extra call per turn, on the highest-value
 * conversation in the product; a cheaper single call would have to choose
 * between validated facts and a responsive reply.
 */

import "server-only";

import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { streamOrFallback } from "@/lib/ai/stream";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { logServerError } from "@/lib/server/safe-error";

import { loadBrief, recordFacts, type BriefOwner } from "./brief-store.server";
import { EXTRACTION_SCHEMA, parseExtraction } from "./extraction";
import {
  buildExtractionMessage,
  buildExtractionPrompt,
  buildReplyMessage,
  buildReplyPrompt,
} from "./prompts";
import {
  admitTurn,
  decideNextMove,
  detectsWrapUpIntent,
  emailGate,
  knowledgePanel,
  type ConversationState,
  type NextMove,
} from "./conversation";
import { questionById, type Question } from "./questions";
import { packForBrief } from "./pack-for-brief";
import type { IndustryPack } from "./industry-packs";
import { sanitizeAgentReply } from "./agent-guardrails";
import {
  logIntakeAbandoned,
  logQuestionUnanswerable,
  logQuestionAsked,
  logQuestionYield,
} from "./intake-telemetry";
import type { Brief } from "./brief-store";

/** Tokens for a reply. Two or three sentences needs nothing like this much. */
const REPLY_MAX_TOKENS = 400;
const EXTRACTION_MAX_TOKENS = 1200;

/** Wall clock per model call. Past this the visitor has given up anyway. */
const MODEL_TIMEOUT_MS = 20_000;

export type TurnRequest = {
  owner: BriefOwner;
  brief: Brief;
  userMessage: string;
  locale: "en" | "es";
  /** The question that was on screen. Null on the very first turn. */
  pendingQuestionId: string | null;
  state: ConversationState;
  /** For telemetry only. Never used to authorise anything. */
  scope: { sessionId?: string | null; userId?: string | null; locale?: string | null };
};

export type TurnEvent =
  /** Facts recorded this turn, and the refreshed panel. Emitted before prose. */
  | {
      type: "understood";
      learned: Array<{ factKey: string; value: unknown; confidence: number }>;
      panel: ReturnType<typeof knowledgePanel>;
    }
  | { type: "text"; delta: string }
  /** The turn is complete. `nextQuestionId` is what the client echoes back. */
  | {
      type: "done";
      reply: string;
      nextQuestionId: string | null;
      move: NextMove["kind"];
      emailAsk: "no" | "offer" | "needed";
      panel: ReturnType<typeof knowledgePanel>;
    }
  | { type: "error"; code: string; message: string };

/**
 * Race a promise against the clock.
 *
 * A hung provider connection must not hold an SSE stream open until the
 * platform's own timeout kills it, because at that point the client has no error
 * to render and the user sees a frozen chat.
 */
async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onTimeout), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run a turn, yielding events as they happen.
 *
 * Never throws. Every failure path yields an `error` event instead, because a
 * thrown exception mid-stream leaves the client with half a sentence and no
 * explanation, and this is a signup conversation.
 */
export async function* runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
  const { brief, userMessage, locale, state } = request;

  const admission = admitTurn(state, userMessage);
  if (!admission.ok) {
    yield { type: "error", code: admission.code, message: admission.message };
    return;
  }

  const gate = await assertAiInvocationAllowed();
  if (!gate.ok) {
    yield {
      type: "error",
      code: gate.code,
      // The visitor is not the right audience for a spend-cap message.
      message: "The assistant is busy right now. Please try again shortly.",
    };
    return;
  }

  const adapter = await resolveAiChatAdapter();
  const pendingQuestion = request.pendingQuestionId
    ? questionById(request.pendingQuestionId)
    : null;

  // ── 1. Extract ─────────────────────────────────────────────────────────────
  const learned = await extractAndRecord({
    adapter,
    brief,
    userMessage,
    question: pendingQuestion,
    // Matched from what is known BEFORE this turn. The pack widens the
    // extractor's vocabulary, so it has to be resolved before the extraction
    // rather than from its output.
    pack: state.pack ?? packForBrief(brief),
  });

  // Re-read rather than patching the in-memory set: `recordFacts` applies the
  // precedence rules, so a proposal can be legitimately DROPPED for losing to an
  // existing confirmed fact. Trusting the extraction output here would make the
  // panel claim knowledge the Brief does not have.
  const refreshed = (await loadBrief(request.owner)) ?? brief;
  const nextState: ConversationState = {
    ...state,
    knownFactKeys: new Set(refreshed.facts.map((f) => f.factKey)),
    confirmedFactKeys: new Set(
      refreshed.facts.filter((f) => f.status === "confirmed").map((f) => f.factKey),
    ),
    userTurns: state.userTurns + 1,
    wantsToWrapUp: state.wantsToWrapUp || detectsWrapUpIntent(userMessage),
    // Recomputed from the refreshed Brief, not carried forward, because the
    // matching facts usually arrive mid-conversation: someone who opens with "I
    // run a studio in Tulum" is unmatched, and becomes a photographer three
    // turns later. Latching the first result would mean the pack fires only for
    // people who happened to lead with their trade.
    pack: packForBrief(refreshed),
  };

  const panel = knowledgePanel(nextState);
  yield { type: "understood", learned, panel };

  if (pendingQuestion) {
    // Scoped with the pack matched BEFORE the turn, because that is the pack
    // whose question was being answered. Using the post-extraction pack would
    // attribute the yield to a pack that had not been active when it was asked.
    void logQuestionYield({ ...request.scope, packId: state.pack?.id ?? null }, pendingQuestion, {
      factKeys: learned.map((l) => l.factKey),
      meanConfidence:
        learned.length === 0
          ? 0
          : learned.reduce((sum, l) => sum + l.confidence, 0) / learned.length,
      reAsk: (state.asked.find((a) => a.questionId === pendingQuestion.id)?.asks ?? 0) > 1,
    }).catch(() => {});

    // ── SIGNAL 4a — they could not answer this one ──────────────────────────
    //
    // Defined as: asked before, answered again, and STILL none of its targets
    // came back. Not "yielded nothing", which is the ordinary first-ask outcome
    // when someone replies to a different part of the conversation. The re-ask
    // is what makes it evidence: two genuine attempts producing nothing is a
    // question that does not fit this person's trade.
    //
    // This is the signal Phase 6 closes on. A question a whole pack cannot
    // answer belongs in a different pack, or nowhere, and the pack id on the row
    // is what makes that readable.
    const asksBefore = state.asked.find((a) => a.questionId === pendingQuestion.id)?.asks ?? 0;
    const gotATarget = pendingQuestion.targets.some((target) =>
      learned.some((l) => l.factKey === target),
    );
    if (asksBefore >= 1 && pendingQuestion.targets.length > 0 && !gotATarget) {
      void logQuestionUnanswerable(
        { ...request.scope, packId: state.pack?.id ?? null },
        pendingQuestion,
        // The raw trade as they described it, alongside the matched pack. When
        // no pack matched, this string is the only clue about who the question
        // failed for, and it is the input to writing the pack that would fix it.
        stringFactValue(refreshed, "work.discipline") ??
          stringFactValue(refreshed, "work.industry"),
      ).catch(() => {});
    }
  }

  // ── 2. Decide ──────────────────────────────────────────────────────────────
  const move = decideNextMove(nextState);
  const email = emailGate(nextState);
  const emailAsk = email.allowed ? email.urgency : "no";

  // ── 3. Reply ───────────────────────────────────────────────────────────────
  const replyPrompt = buildReplyPrompt({
    move,
    justLearned: learned.map((l) => ({ factKey: l.factKey, value: l.value })),
    emailAsk,
    locale,
  });

  let raw = "";
  let streamFailed: { code: string; message: string } | null = null;

  try {
    for await (const event of streamOrFallback(adapter, {
      systemPrompt: replyPrompt,
      userMessage: buildReplyMessage(userMessage),
      maxTokens: REPLY_MAX_TOKENS,
      temperature: 0.6,
    })) {
      if (event.type === "text") {
        raw += event.delta;
        // Deltas are forwarded unsanitised, then the sanitised full text is sent
        // on `done` for the client to settle on. Sanitising a partial stream
        // cannot work: a rule spanning a token boundary would fire on a fragment
        // and mangle text that was about to be fine.
        yield { type: "text", delta: event.delta };
      } else if (event.type === "error") {
        streamFailed = { code: event.code, message: event.message };
      } else if (event.type === "done") {
        raw = event.text;
      }
    }
  } catch (err) {
    logServerError("tulala.runTurn.stream", err);
    streamFailed = { code: "stream_failed", message: "The reply was interrupted." };
  }

  void recordAiUsageEstimate().catch(() => {});

  const guarded = sanitizeAgentReply(raw, { locale, move: move.kind });

  if (!guarded.text) {
    // No usable prose. The turn still SUCCEEDED — facts were recorded and the
    // panel moved — so this must not read as a failed turn. A deterministic
    // fallback keeps the conversation alive; failing here would discard real
    // extracted facts over a cosmetic problem.
    if (streamFailed) logServerError("tulala.runTurn.model", new Error(streamFailed.code));
    yield {
      type: "done",
      reply: fallbackReply(move, locale),
      nextQuestionId: questionIdFor(move),
      move: move.kind,
      emailAsk,
      panel,
    };
    return;
  }

  const nextQuestionId = questionIdFor(move);
  if (nextQuestionId) {
    const question = questionById(nextQuestionId);
    if (question) {
      const asks = nextState.asked.find((a) => a.questionId === question.id)?.asks ?? 0;
      void logQuestionAsked(
        { ...request.scope, packId: nextState.pack?.id ?? null },
        question,
        asks + 1,
      ).catch(() => {});
    }
  }

  yield {
    type: "done",
    reply: guarded.text,
    nextQuestionId,
    move: move.kind,
    emailAsk,
    panel,
  };
}

function questionIdFor(move: NextMove): string | null {
  return move.kind === "ask" ? move.question.id : null;
}

/**
 * Deterministic prose for when the model produced nothing usable.
 *
 * Reads the decided move rather than apologising generically, so a dropped
 * model call still advances the conversation instead of stalling it.
 */
function fallbackReply(move: NextMove, locale: "en" | "es"): string {
  if (move.kind === "ask") {
    return move.question.phrasing[locale].text;
  }
  if (locale === "es") {
    return move.kind === "recommend"
      ? "Ya tengo lo que necesito. Mira lo que te recomiendo."
      : "Cuéntame un poco más sobre cómo está organizado tu trabajo.";
  }
  return move.kind === "recommend"
    ? "I have what I need. Here is what I would suggest."
    : "Tell me a little more about how your work is organised.";
}

// ─── Extraction step ──────────────────────────────────────────────────────────

type LearnedFact = { factKey: string; value: unknown; confidence: number };

async function extractAndRecord(input: {
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

    const result = await recordFacts(input.brief.id, parsed.facts);
    const written = new Set(result.written);
    return parsed.facts
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

// ─── Abandonment ──────────────────────────────────────────────────────────────

/**
 * Record that a session went cold, with the question that was on screen.
 *
 * Signal 1 of the learning loop, and the strongest evidence a question is bad.
 * Called from the beacon endpoint rather than inferred later, because "no turn
 * for N minutes" is not recoverable from event rows without a scheduled job
 * nobody has written.
 */
export async function recordAbandonment(input: {
  scope: { sessionId?: string | null; userId?: string | null; locale?: string | null };
  pendingQuestionId: string | null;
  userTurns: number;
  factsKnown: number;
  /** The pack active when they left. Null when the generic intake applied. */
  packId?: string | null;
}): Promise<void> {
  const question = input.pendingQuestionId ? questionById(input.pendingQuestionId) : null;
  await logIntakeAbandoned({ ...input.scope, packId: input.packId ?? null }, {
    question,
    turns: input.userTurns,
    factsKnown: input.factsKnown,
  });
}

/**
 * A string fact, or null. Local rather than shared: three modules each need two
 * lines of this and a shared helper would be a dependency for two lines.
 */
function stringFactValue(brief: Brief, key: string): string | null {
  const value = brief.facts.find((f) => f.factKey === key && f.status !== "rejected")?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
