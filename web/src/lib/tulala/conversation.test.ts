/**
 * Tests for the conversation state machine.
 *
 * These are the rules that must not drift on a Tuesday: when the email may be
 * asked for, when the flow is allowed to recommend, and when it has to admit it
 * does not know enough. Each one is a business decision, which is exactly why
 * none of them live in a prompt.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_USER_MESSAGE_CHARS,
  MAX_USER_TURNS,
  MIN_FACTS_TO_RECOMMEND,
  MIN_TURNS_BEFORE_EMAIL,
  admitTurn,
  canRecommend,
  decideNextMove,
  detectsWrapUpIntent,
  emailGate,
  knowledgePanel,
  recordAsked,
  type ConversationState,
} from "./conversation";
import { QUESTIONS, missingDecisiveQuestions } from "./questions";

/** Every fact key the decisive questions want. A "fully understood" setup. */
const DECISIVE_KEYS = Array.from(
  new Set(QUESTIONS.filter((q) => q.decisive).flatMap((q) => q.targets)),
);

function stateOf(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    knownFactKeys: new Set(),
    confirmedFactKeys: new Set(),
    asked: [],
    userTurns: 0,
    hasEmail: false,
    isAuthenticated: false,
    wantsToWrapUp: false,
    ...overrides,
  };
}

/** A state where the engine genuinely has enough: decisive answered, 4 confirmed. */
function readyState(overrides: Partial<ConversationState> = {}): ConversationState {
  const known = new Set(DECISIVE_KEYS);
  return stateOf({
    knownFactKeys: known,
    confirmedFactKeys: new Set(Array.from(known).slice(0, MIN_FACTS_TO_RECOMMEND)),
    userTurns: 6,
    ...overrides,
  });
}

// ─── The email gate ───────────────────────────────────────────────────────────

test("email is not asked for on the first turns", () => {
  // The single most reliable way to lose an anonymous visitor.
  for (let turns = 0; turns < MIN_TURNS_BEFORE_EMAIL; turns += 1) {
    const gate = emailGate(stateOf({ userTurns: turns }));
    assert.equal(gate.allowed, false, `turn ${turns} must not ask`);
    if (!gate.allowed) assert.equal(gate.reason, "too_early");
  }
});

test("email becomes an offer once there is something to save", () => {
  const gate = emailGate(stateOf({ userTurns: MIN_TURNS_BEFORE_EMAIL }));
  assert.equal(gate.allowed, true);
  if (gate.allowed) assert.equal(gate.urgency, "offer");
});

test("email becomes required only once a recommendation exists", () => {
  const gate = emailGate(readyState());
  assert.equal(gate.allowed, true);
  if (gate.allowed) assert.equal(gate.urgency, "needed");
});

test("email is never asked for when we already have it", () => {
  for (const s of [
    readyState({ hasEmail: true }),
    readyState({ isAuthenticated: true }),
  ]) {
    const gate = emailGate(s);
    assert.equal(gate.allowed, false);
    if (!gate.allowed) assert.equal(gate.reason, "already_have_it");
  }
});

// ─── When we may recommend ────────────────────────────────────────────────────

test("cannot recommend on guesses alone", () => {
  // Known but unconfirmed is enough to skip a question, NOT enough to sell on.
  const known = new Set(DECISIVE_KEYS);
  assert.equal(
    canRecommend(stateOf({ knownFactKeys: known, confirmedFactKeys: new Set() })),
    false,
  );
});

test("cannot recommend with a decisive question unanswered", () => {
  const confirmed = new Set(["person.name", "person.city", "work.discipline", "brand.tone"]);
  assert.ok(confirmed.size >= MIN_FACTS_TO_RECOMMEND);
  assert.equal(
    canRecommend(stateOf({ knownFactKeys: confirmed, confirmedFactKeys: confirmed })),
    false,
    "a missing decisive answer means the engine is guessing at what they pay",
  );
});

test("can recommend once decisive answers and enough confirmed facts are in", () => {
  assert.equal(canRecommend(readyState()), true);
});

// ─── Next move ────────────────────────────────────────────────────────────────

test("opens by asking, not by recommending", () => {
  const move = decideNextMove(stateOf());
  assert.equal(move.kind, "ask");
  if (move.kind === "ask") {
    assert.equal(move.question.id, "discovery.opening");
    assert.equal(move.isReAsk, false);
  }
});

test("flags a re-ask so the Agent rephrases instead of repeating", () => {
  const move = decideNextMove(
    stateOf({ asked: [{ questionId: "discovery.opening", asks: 1 }] }),
  );
  assert.equal(move.kind, "ask");
  // The opening is spent; whatever comes next is fresh.
  if (move.kind === "ask") assert.equal(move.isReAsk, false);

  const reAsk = decideNextMove(
    stateOf({
      asked: [
        { questionId: "discovery.opening", asks: 1 },
        { questionId: "identity.name", asks: 1 },
      ],
    }),
  );
  assert.equal(reAsk.kind, "ask");
  if (reAsk.kind === "ask") {
    assert.equal(reAsk.question.id, "identity.name");
    assert.equal(reAsk.isReAsk, true);
  }
});

test("stops asking and recommends once there is enough", () => {
  const asked = QUESTIONS.map((q) => ({ questionId: q.id, asks: 2 }));
  const move = decideNextMove(readyState({ asked }));
  assert.equal(move.kind, "recommend");
});

test("admits ignorance rather than inventing a plan", () => {
  // Out of askable questions, still under the floor. The honest move is to say
  // so; recommending here would be a guess wearing a price tag.
  const asked = QUESTIONS.map((q) => ({ questionId: q.id, asks: 2 }));
  const move = decideNextMove(stateOf({ asked, userTurns: 8 }));
  assert.equal(move.kind, "too_little_known");
  if (move.kind === "too_little_known") {
    assert.ok(move.missingDecisive.length > 0);
  }
});

test("the turn ceiling ends the conversation whatever the state", () => {
  const move = decideNextMove(readyState({ userTurns: MAX_USER_TURNS }));
  assert.equal(move.kind, "ceiling_reached");
});

// ─── Wrap-up ──────────────────────────────────────────────────────────────────

test("an impatient user skips the optional questions", () => {
  const asked = [{ questionId: "discovery.opening", asks: 1 }];
  const move = decideNextMove(readyState({ wantsToWrapUp: true, asked }));
  assert.equal(move.kind, "recommend");
});

test("wrapping up skips to the load-bearing questions, not past them", () => {
  // Honouring "just show me" literally would mean pricing them on a coin flip.
  // So impatience drops every optional question and asks only what changes the
  // answer, which is the shortest honest route to what they asked for.
  const move = decideNextMove(
    stateOf({
      wantsToWrapUp: true,
      userTurns: 3,
      knownFactKeys: new Set(["person.name"]),
      confirmedFactKeys: new Set(["person.name"]),
    }),
  );
  assert.equal(move.kind, "ask");
  if (move.kind === "ask") {
    assert.equal(move.question.decisive, true, "an impatient user gets decisive questions only");
  }
});

test("wrapping up proceeds once the decisive questions are spent", () => {
  // All decisive questions asked twice. A third ask reads as not listening, so
  // the flow moves on and the approval screen carries the uncertainty.
  const asked = QUESTIONS.filter((q) => q.decisive).map((q) => ({
    questionId: q.id,
    asks: 2,
  }));
  const move = decideNextMove(
    stateOf({
      wantsToWrapUp: true,
      userTurns: 5,
      asked,
      knownFactKeys: new Set(["person.name"]),
      confirmedFactKeys: new Set(["person.name"]),
    }),
  );
  assert.equal(move.kind, "too_little_known");
});

test("wrap-up intent is caught in both languages", () => {
  for (const text of [
    "just show me the options",
    "skip this",
    "that's enough",
    "no more questions please",
    "muéstrame ya",
    "suficiente",
  ]) {
    assert.equal(detectsWrapUpIntent(text), true, text);
  }
});

test("normal answers are not mistaken for impatience", () => {
  for (const text of [
    "I do nails at home",
    "There are four of us including me",
    "I take a cut of each booking",
    "Tengo un salón con tres personas",
  ]) {
    assert.equal(detectsWrapUpIntent(text), false, text);
  }
});

// ─── Admission ────────────────────────────────────────────────────────────────

test("empty and oversized turns are rejected before anything costs money", () => {
  assert.equal(admitTurn(stateOf(), "   ").ok, false);
  const long = admitTurn(stateOf(), "x".repeat(MAX_USER_MESSAGE_CHARS + 1));
  assert.equal(long.ok, false);
  if (!long.ok) assert.equal(long.code, "too_long");
  assert.equal(admitTurn(stateOf(), "I do nails").ok, true);
});

test("the ceiling is enforced on admission, not just on the next move", () => {
  const result = admitTurn(stateOf({ userTurns: MAX_USER_TURNS }), "hello");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ceiling");
});

// ─── Panel ────────────────────────────────────────────────────────────────────

test("progress is measured on the decisive questions only", () => {
  // A bar over twenty questions implies twenty are required. They are not.
  const empty = knowledgePanel(stateOf());
  assert.equal(empty.decisiveProgress, 0);
  assert.equal(empty.readyToRecommend, false);

  const done = knowledgePanel(readyState());
  assert.equal(done.decisiveProgress, 1);
  assert.equal(done.readyToRecommend, true);
});

test("progress never goes backwards as facts arrive", () => {
  // The denominator is fixed. Gating it on askWhen would shrink it mid-flow and
  // the bar would visibly regress, which reads as the Agent losing track.
  let previous = -1;
  const accumulate = new Set<string>();
  for (const key of DECISIVE_KEYS) {
    accumulate.add(key);
    const panel = knowledgePanel(stateOf({ knownFactKeys: new Set(accumulate) }));
    assert.ok(
      panel.decisiveProgress >= previous,
      `regressed at ${key}: ${panel.decisiveProgress} < ${previous}`,
    );
    previous = panel.decisiveProgress;
  }
});

test("panel reports both known and confirmed counts", () => {
  const panel = knowledgePanel(
    stateOf({
      knownFactKeys: new Set(["a", "b", "c"]),
      confirmedFactKeys: new Set(["a"]),
    }),
  );
  assert.equal(panel.factsKnown, 3);
  assert.equal(panel.factsConfirmed, 1);
  assert.ok(panel.stages.length > 0);
});

// ─── Bookkeeping ──────────────────────────────────────────────────────────────

test("recordAsked increments without mutating the input", () => {
  const original = [{ questionId: "identity.name", asks: 1 }];
  const next = recordAsked(original, "identity.name");
  assert.equal(original[0].asks, 1, "must not mutate: state is reused across a turn");
  assert.equal(next[0].asks, 2);

  const added = recordAsked(next, "identity.city");
  assert.equal(added.length, 2);
  assert.equal(added.find((a) => a.questionId === "identity.city")?.asks, 1);
});

test("the decisive set is non-empty, or every gate above is vacuous", () => {
  assert.ok(missingDecisiveQuestions(new Set()).length > 0);
  assert.ok(DECISIVE_KEYS.length > 0);
});
