/**
 * conversation.ts — the intake conversation, as a pure state machine.
 *
 * WHY THE LOGIC IS NOT IN THE PROMPT
 * ──────────────────────────────────
 * Everything here is a decision the business cannot afford to have re-derived
 * probabilistically on every turn: when to stop asking, when the email is
 * allowed to be requested, when there is enough to recommend, when to give up.
 * A model asked to make those calls will make them differently on Tuesday.
 *
 * So the model gets exactly two jobs — extract facts from prose, and speak the
 * next question naturally — and this module decides everything else. That is
 * also what makes the flow testable: every rule below is asserted as a literal
 * in `conversation.test.ts`, with no API key involved.
 */

import {
  QUESTIONS,
  missingDecisiveQuestions,
  nextQuestion,
  stageProgress,
  type AskedRecord,
  type Question,
  type Stage,
} from "./questions";
import type { IndustryPack } from "./industry-packs";

// ─── Shape ────────────────────────────────────────────────────────────────────

export type TurnRole = "user" | "agent";

export type ConversationTurn = {
  role: TurnRole;
  /** Not persisted beyond the live session. See the retention note below. */
  text: string;
  /** The question this turn was delivering, when it was delivering one. */
  questionId?: string | null;
};

export type ConversationState = {
  /** Fact keys the Brief already holds, at any status. */
  knownFactKeys: ReadonlySet<string>;
  /**
   * Fact keys with `status: confirmed`. Separate from `knownFactKeys` because a
   * guess is enough to skip a question but NOT enough to sell a plan on.
   */
  confirmedFactKeys: ReadonlySet<string>;
  asked: readonly AskedRecord[];
  /** User turns taken. The abuse ceiling and the pacing rules both key on it. */
  userTurns: number;
  /** True once an email is attached, whether typed here or already signed in. */
  hasEmail: boolean;
  /** True when the visitor is authenticated, which makes the email moot. */
  isAuthenticated: boolean;
  /** Set when the visitor asked to stop being asked things. */
  wantsToWrapUp: boolean;
  /**
   * The industry pack matched from what they have said so far, or null.
   *
   * Recomputed from the Brief every turn rather than latched, because the
   * matching facts arrive mid-conversation: someone who opens with "I run a
   * studio" and only later says "I'm a photographer" must get the photo pack
   * from the turn it becomes knowable. Null is the normal case and the core
   * questionnaire stands alone.
   */
  pack?: IndustryPack | null;
};

/**
 * The ceiling on user turns.
 *
 * A limit rather than an open-ended chat for two independent reasons, and both
 * matter: an anonymous LLM endpoint with no ceiling is an invoice waiting to
 * happen, and an intake that will not stop asking is a worse experience than a
 * form. Twenty is well past the point where the decisive questions are answered
 * in any real conversation.
 */
export const MAX_USER_TURNS = 20;

/**
 * Turns before the email may be requested.
 *
 * The plan's rule is "email after value", and the number is where value is
 * actually demonstrable: by the third answer the Agent can name their trade,
 * their city and their shape, so the ask is "save this" rather than "pay a toll
 * to begin". Asking on turn one is the single most reliable way to lose an
 * anonymous visitor, and it is what the old single-question form did.
 */
export const MIN_TURNS_BEFORE_EMAIL = 3;

/** Facts that must be confirmed before a recommendation is worth showing. */
export const MIN_FACTS_TO_RECOMMEND = 4;

// ─── What the Agent should do next ────────────────────────────────────────────

export type NextMove =
  /** Ask this. The normal case. */
  | { kind: "ask"; question: Question; isReAsk: boolean }
  /**
   * Nothing decisive left and enough on the table. Stop asking and show the
   * recommendation — an Agent that keeps going here reads as not listening.
   */
  | { kind: "recommend" }
  /**
   * Out of questions but under the evidence floor. Distinct from `recommend`
   * because the honest move is to say so, not to invent a plan.
   */
  | { kind: "too_little_known"; missingDecisive: Question[] }
  /** The ceiling. Wrap up with whatever is known. */
  | { kind: "ceiling_reached" };

export function decideNextMove(state: ConversationState): NextMove {
  if (state.userTurns >= MAX_USER_TURNS) return { kind: "ceiling_reached" };

  const missingDecisive = missingDecisiveQuestions(state.knownFactKeys);

  // An explicit "just show me" outranks the question list, but not the decisive
  // ones: without those the engine is guessing at what they pay, and honouring
  // the request literally would mean recommending on a coin flip.
  //
  // So impatience does not skip TO the end, it skips to what is load-bearing.
  // Every non-decisive question is dropped and only the ones that change the
  // answer are asked, which is the shortest honest path to the thing they asked
  // for.
  if (state.wantsToWrapUp) {
    if (missingDecisive.length === 0) {
      return canRecommend(state)
        ? { kind: "recommend" }
        : { kind: "too_little_known", missingDecisive };
    }
    const question = firstAskable(missingDecisive, state.asked);
    if (question) {
      const asks = state.asked.find((a) => a.questionId === question.id)?.asks ?? 0;
      return { kind: "ask", question, isReAsk: asks > 0 };
    }
    // Every decisive question has hit its re-ask cap. Asking a third time reads
    // as not listening, so proceed on what is known and let the approval screen
    // say what is still unclear.
    return canRecommend(state)
      ? { kind: "recommend" }
      : { kind: "too_little_known", missingDecisive };
  }

  const question = nextQuestion(state.knownFactKeys, state.asked, {
    pack: state.pack ?? null,
  });
  if (question) {
    const asks = state.asked.find((a) => a.questionId === question.id)?.asks ?? 0;
    return { kind: "ask", question, isReAsk: asks > 0 };
  }

  if (canRecommend(state)) return { kind: "recommend" };
  return { kind: "too_little_known", missingDecisive };
}

const MAX_ASKS_PER_QUESTION = 2;

/** The first of `candidates` that has not hit its re-ask cap. */
function firstAskable(
  candidates: readonly Question[],
  asked: readonly AskedRecord[],
): Question | null {
  return (
    candidates.find(
      (q) => (asked.find((a) => a.questionId === q.id)?.asks ?? 0) < MAX_ASKS_PER_QUESTION,
    ) ?? null
  );
}

/**
 * Enough evidence to put a recommendation in front of someone.
 *
 * Counts CONFIRMED facts only. A recommendation built on four guesses is a
 * guess, and the whole reason inferences carry a status is so they cannot
 * quietly become the basis of a charge.
 */
export function canRecommend(state: ConversationState): boolean {
  if (state.confirmedFactKeys.size < MIN_FACTS_TO_RECOMMEND) return false;
  return missingDecisiveQuestions(state.knownFactKeys).length === 0;
}

// ─── The email gate ───────────────────────────────────────────────────────────

export type EmailGate =
  | { allowed: false; reason: "already_have_it" | "too_early" }
  | { allowed: true; urgency: "offer" | "needed" };

/**
 * Whether the Agent may ask for an email yet, and how hard.
 *
 * A gate rather than a prompt instruction because this is the highest-leverage
 * rule in the flow and the one a model is most likely to break when a
 * conversation goes somewhere unexpected. `needed` only appears at the moment
 * there is something concrete to lose, which is the only honest time to insist.
 */
export function emailGate(state: ConversationState): EmailGate {
  if (state.hasEmail || state.isAuthenticated) {
    return { allowed: false, reason: "already_have_it" };
  }
  if (state.userTurns < MIN_TURNS_BEFORE_EMAIL) {
    return { allowed: false, reason: "too_early" };
  }
  return { allowed: true, urgency: canRecommend(state) ? "needed" : "offer" };
}

// ─── The "What I know" panel ──────────────────────────────────────────────────

export type KnowledgePanel = {
  stages: Array<{ stage: Stage; satisfied: number; total: number; complete: boolean }>;
  /** 0..1 across the decisive questions only. What actually gates the outcome. */
  decisiveProgress: number;
  factsKnown: number;
  factsConfirmed: number;
  /** True when the panel should show a recommendation CTA. */
  readyToRecommend: boolean;
  /**
   * The matched pack's id, or null.
   *
   * Surfaced because it is the visible proof that the intake recognised the
   * trade. "Massage and bodywork" appearing in the panel does more to earn the
   * next answer than any amount of prose claiming to understand, and when it is
   * WRONG the visitor can see that immediately instead of after four odd
   * questions.
   */
  packId: string | null;
};

/**
 * The visible receipt of what has been understood.
 *
 * Progress is measured on the DECISIVE questions, not on the full bank. A bar
 * that moves through twenty questions implies twenty are required, which is a
 * promise the flow does not intend to keep — most conversations end after the
 * decisive ones are answered.
 */
export function knowledgePanel(state: ConversationState): KnowledgePanel {
  const answered = DECISIVE_QUESTIONS.filter(
    (q) => q.targets.length > 0 && q.targets.every((t) => state.knownFactKeys.has(t)),
  ).length;

  return {
    stages: stageProgress(state.knownFactKeys, state.pack ?? null).map((s) => ({
      ...s,
      complete: s.total > 0 && s.satisfied === s.total,
    })),
    decisiveProgress:
      DECISIVE_QUESTIONS.length === 0 ? 1 : answered / DECISIVE_QUESTIONS.length,
    factsKnown: state.knownFactKeys.size,
    factsConfirmed: state.confirmedFactKeys.size,
    readyToRecommend: canRecommend(state),
    packId: state.pack?.id ?? null,
  };
}

/**
 * Every decisive question, gating ignored.
 *
 * The denominator has to be FIXED and progress counted by satisfaction, not by
 * subtracting what is still missing. Missing-count is gated on `askWhen`, so it
 * GROWS when a fact unlocks a follow-up: answering "yes, three of us work here"
 * unlocks two more decisive questions, and a subtractive bar would visibly jump
 * backwards at exactly the moment the user told us something important. Counting
 * satisfied questions against a constant total only ever moves forward.
 */
const DECISIVE_QUESTIONS = QUESTIONS.filter((q) => q.decisive);

// ─── Wrap-up intent ───────────────────────────────────────────────────────────

const WRAP_UP_PATTERNS = [
  /\b(just|already)\s+(show|give|tell)\s+me\b/i,
  /\bskip\b/i,
  /\bthat'?s? (it|all|enough)\b/i,
  /\bno more questions\b/i,
  /\bget (on|to) (with|the) (it|point)\b/i,
  /\b(ya|ya\s+está|suficiente|sin más preguntas)\b/i,
  /\b(mu[ée]strame|ens[eé]ñame)\s+(ya|el|la)\b/i,
];

/**
 * Detect "stop asking me things" without a model call.
 *
 * Regex rather than an LLM classifier because this must work on the turn it is
 * said. Routing it through the model means the impatient user gets one more
 * question first, which is precisely the thing they just objected to. False
 * negatives are cheap here (they say it again); a false positive only skips
 * non-decisive questions, since `decideNextMove` still refuses to abandon a
 * decisive one.
 */
export function detectsWrapUpIntent(text: string): boolean {
  return WRAP_UP_PATTERNS.some((p) => p.test(text));
}

// ─── Abuse ────────────────────────────────────────────────────────────────────

export type TurnAdmission =
  | { ok: true }
  | { ok: false; code: "ceiling"; message: string }
  | { ok: false; code: "empty"; message: string }
  | { ok: false; code: "too_long"; message: string };

/** Longest single user turn accepted. Past this it is a paste, not an answer. */
export const MAX_USER_MESSAGE_CHARS = 2000;

/**
 * Cheap local checks before anything costly happens.
 *
 * Ordered by cost deliberately: length and emptiness are free and reject the
 * bulk of junk, so they run before the KV round trip and long before a token is
 * spent. The route still applies the IP and session limits — this is the floor,
 * not the whole defence.
 */
export function admitTurn(state: ConversationState, text: string): TurnAdmission {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, code: "empty", message: "Say something first." };
  }
  if (trimmed.length > MAX_USER_MESSAGE_CHARS) {
    return {
      ok: false,
      code: "too_long",
      message: `Keep it under ${MAX_USER_MESSAGE_CHARS} characters.`,
    };
  }
  if (state.userTurns >= MAX_USER_TURNS) {
    return {
      ok: false,
      code: "ceiling",
      message: "We have covered plenty. Let me show you what I would suggest.",
    };
  }
  return { ok: true };
}

// ─── Bookkeeping ──────────────────────────────────────────────────────────────

/** Record that a question was put to the user, incrementing its ask count. */
export function recordAsked(
  asked: readonly AskedRecord[],
  questionId: string,
): AskedRecord[] {
  const next = asked.map((a) => ({ ...a }));
  const existing = next.find((a) => a.questionId === questionId);
  if (existing) {
    existing.asks += 1;
    return next;
  }
  next.push({ questionId, asks: 1 });
  return next;
}
