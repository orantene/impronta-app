/**
 * Tests for the Agent's output guardrails.
 *
 * The stakes here are specific: this text reaches someone at the moment they are
 * deciding whether to enter a card. A hallucinated price is a promise the
 * business must honour or break, and the model cannot know real prices because
 * the prompt deliberately withholds them.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_REPLY_MAX_CHARS, sanitizeAgentReply } from "./agent-guardrails";

const clean = (raw: string) => sanitizeAgentReply(raw, { locale: "en", move: "ask" });

// ─── Money ────────────────────────────────────────────────────────────────────

test("invented prices are stripped, the good sentence survives", () => {
  const result = clean("That sounds like a salon. It is $29 a month. How many of you are there?");
  assert.ok(!result.text.includes("$29"));
  assert.ok(result.text.includes("How many of you are there?"));
  assert.ok(result.violations.includes("currency_symbol"));
});

test("every shape of money claim is caught", () => {
  const cases: Array<[string, string]> = [
    ["It costs $49 monthly.", "currency_symbol"],
    ["That is 79 USD per month.", "currency_code"],
    ["We take 10% of each booking.", "percent"],
    ["Your first two months free.", "free_months"],
    ["You get 15 days free to try it.", "trial_length"],
    ["It is 29 per month.", "per_month"],
    ["Cuesta €39 al mes.", "currency_symbol"],
    ["Nos llevamos el 6 por ciento.", "percent"],
  ];
  for (const [sentence, code] of cases) {
    const result = clean(`Understood. ${sentence}`);
    assert.ok(result.violations.includes(code), `${sentence} → expected ${code}`);
    assert.ok(!result.text.includes(sentence.replace(/\.$/, "")), sentence);
  }
});

test("harmless numbers are NOT stripped", () => {
  // Over-blocking would gut the conversation: headcount is the single most
  // important number in the whole intake.
  for (const text of [
    "So there are four of you including you?",
    "You said three artists work with you.",
    "Two questions left and we are done.",
  ]) {
    const result = clean(text);
    assert.equal(result.text, text, text);
    assert.deepEqual(result.violations, [], text);
  }
});

// ─── Plan names ───────────────────────────────────────────────────────────────

test("the model may not commit to a plan", () => {
  // Naming a tier IS a recommendation, and the recommendation belongs to the
  // engine, shown with its reasons. A model that disagrees with the panel makes
  // the product look broken and the user believes the sentence.
  const result = clean("Got it. The Studio plan is right for you. Where do you work?");
  assert.ok(!/studio/i.test(result.text));
  assert.ok(result.violations.includes("plan_name"));
  assert.ok(result.text.includes("Where do you work?"));
});

test("the word studio in its ordinary sense is left alone", () => {
  const text = "You mentioned your studio in Tulum. Who else works there?";
  assert.equal(clean(text).text, text);
});

// ─── False claims ─────────────────────────────────────────────────────────────

test("claims about actions it has not taken are stripped", () => {
  const cases: Array<[string, string]> = [
    ["I have built your website already.", "claims_built"],
    ["I've created your profile.", "claims_built"],
    ["I have charged your card.", "claims_charged"],
    ["I've emailed you the details.", "claims_emailed"],
    ["Your account is ready.", "claims_saved_account"],
  ];
  for (const [sentence, code] of cases) {
    const result = clean(`${sentence} What next?`);
    assert.ok(result.violations.includes(code), sentence);
    assert.ok(result.text.includes("What next?"));
  }
});

// ─── Formatting ───────────────────────────────────────────────────────────────

test("markdown is stripped rather than rejected", () => {
  const result = clean("## Great\n- **You own a salon**\n- `four artists`\nWhat next?");
  assert.ok(!result.text.includes("#"));
  assert.ok(!result.text.includes("**"));
  assert.ok(!result.text.includes("`"));
  assert.ok(!result.text.includes("- "));
  assert.ok(result.text.includes("What next?"));
});

test("dashes are normalised to house style", () => {
  const result = clean("You own a salon — four artists. Right?");
  assert.ok(!/[—–]/.test(result.text));
  assert.ok(result.violations.includes("dash"));
});

test("only one question survives a turn", () => {
  // A stacked pair gets answered as one, and the second silently goes
  // unanswered, which is where the intake loses facts it thinks it asked for.
  const result = clean("Where do you work? And how many of you are there?");
  assert.equal((result.text.match(/\?/g) ?? []).length, 1);
  assert.ok(result.text.startsWith("Where do you work?"));
  assert.ok(result.violations.includes("multiple_questions"));
});

test("the first question is kept, not the last", () => {
  // The first is the one the flow decided to ask and the one tracked as
  // pendingQuestionId. Keeping the last would make the recorded and asked
  // questions disagree, corrupting the yield measurement for both.
  const result = clean("Do you own the place? Or do you rent a chair?");
  assert.ok(result.text.includes("Do you own the place?"));
  assert.ok(!result.text.includes("rent a chair"));
});

test("long replies are truncated at a sentence boundary", () => {
  const sentence = "This is a complete sentence about your work. ";
  const result = clean(sentence.repeat(40));
  assert.ok(result.text.length <= AGENT_REPLY_MAX_CHARS + 1);
  assert.ok(result.violations.includes("too_long"));
  assert.match(result.text, /[.!?]$/, "must still read as finished");
});

// ─── Degenerate input ─────────────────────────────────────────────────────────

test("empty output is reported, not faked", () => {
  for (const raw of ["", "   ", "\n\n"]) {
    const result = sanitizeAgentReply(raw, { locale: "en", move: "ask" });
    assert.equal(result.text, "");
    assert.ok(result.violations.includes("empty"));
  }
});

test("an all-violation reply yields empty so the caller can fall back", () => {
  // Better to say nothing and let the deterministic fallback speak than to ship
  // a mangled fragment.
  const result = clean("It is $29 a month. I have charged your card.");
  assert.equal(result.text, "");
  assert.ok(result.violations.includes("all_sentences_dropped"));
});

test("a clean reply passes through untouched", () => {
  const text = "So the work happens at your place. Does anyone else work with you?";
  const result = clean(text);
  assert.equal(result.text, text);
  assert.deepEqual(result.violations, []);
});

test("Spanish replies survive intact", () => {
  const text = "Entonces trabajas en tu propio local. ¿Trabaja alguien más contigo?";
  const result = sanitizeAgentReply(text, { locale: "es", move: "ask" });
  assert.equal(result.text, text);
  assert.deepEqual(result.violations, []);
});
