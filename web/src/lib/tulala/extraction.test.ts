/**
 * Tests for fact extraction.
 *
 * The adversarial half of the Tulala suite. Every case here is a thing a model
 * has done or will do: invent a key, send the wrong type, claim certainty about
 * a guess, emit fenced JSON, contradict itself in one payload. The cost of any
 * one getting through is not a crash, it is a confident wrong claim about
 * someone's business that then argues for the wrong plan.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTRACTION_SCHEMA,
  MAX_EXTRACTION_CONFIDENCE,
  MAX_QUOTE_CHARS,
  MIN_EXTRACTION_CONFIDENCE,
  coerceValue,
  factVocabularyForPrompt,
  parseExtraction,
} from "./extraction";
import { FACT_KEYS, isKnownFactKey } from "./fact-keys";

const payload = (facts: unknown[]) => JSON.stringify({ facts });

const one = (over: Record<string, unknown> = {}) =>
  payload([
    { key: "person.name", value: "Sofia", confidence: 0.9, quote: "I'm Sofia", ...over },
  ]);

// ─── The L20 guarantee ────────────────────────────────────────────────────────

test("nothing extracted is ever confirmed", () => {
  // The whole architecture rests on this: a model may propose, only a human
  // confirms. An extractor that could emit `user_stated` would route straight
  // past the approval queue.
  const result = parseExtraction(one());
  assert.equal(result.facts.length, 1);
  for (const fact of result.facts) {
    assert.equal(fact.source, "ai_inference");
    assert.equal(fact.status, undefined, "status is the store's decision, not the extractor's");
  }
});

test("confidence is capped even when the model claims certainty", () => {
  const result = parseExtraction(one({ confidence: 1 }));
  assert.equal(result.facts[0].confidence, MAX_EXTRACTION_CONFIDENCE);
});

// ─── Rejection ────────────────────────────────────────────────────────────────

test("invented keys are rejected, not stored", () => {
  // TEXT column by design, so this function is the only thing standing between
  // a hallucinated key and a permanent row.
  const result = parseExtraction(
    payload([{ key: "business.vibe_score", value: "8", confidence: 0.9, quote: "" }]),
  );
  assert.equal(result.facts.length, 0);
  assert.deepEqual(result.rejected, [{ key: "business.vibe_score", reason: "unknown_key" }]);
});

test("low-confidence guesses are dropped", () => {
  const result = parseExtraction(one({ confidence: MIN_EXTRACTION_CONFIDENCE - 0.01 }));
  assert.equal(result.facts.length, 0);
  assert.equal(result.rejected[0].reason, "low_confidence");
});

test("values that do not match the declared type are rejected", () => {
  const result = parseExtraction(
    payload([
      { key: "business.staff_count", value: "lots", confidence: 0.9, quote: "lots of us" },
      { key: "business.has_staff", value: "maybe", confidence: 0.9, quote: "maybe" },
    ]),
  );
  assert.equal(result.facts.length, 0);
  assert.equal(result.rejected.length, 2);
  for (const r of result.rejected) assert.equal(r.reason, "bad_value");
});

test("a value outside an enum's allowed list is rejected", () => {
  const result = parseExtraction(
    payload([
      { key: "business.works_from", value: "the beach", confidence: 0.9, quote: "the beach" },
    ]),
  );
  assert.equal(result.facts.length, 0);
  assert.equal(result.rejected[0].reason, "bad_value");
});

test("a self-contradicting payload keeps only the first mention", () => {
  const result = parseExtraction(
    payload([
      { key: "business.has_staff", value: "true", confidence: 0.9, quote: "three of us" },
      { key: "business.has_staff", value: "false", confidence: 0.9, quote: "just me" },
    ]),
  );
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].value, true, "the first mention owns the quote");
});

// ─── Malformed payloads ───────────────────────────────────────────────────────

test("unparseable output degrades to learning nothing, never to a throw", () => {
  // This lands mid-signup. A 500 here loses the person, not just the turn.
  for (const bad of ["", "not json", "{", '{"facts":"nope"}', "null"]) {
    const result = parseExtraction(bad);
    assert.equal(result.parseFailed, true, bad);
    assert.equal(result.facts.length, 0);
  }
});

test("parseFailed is distinct from an honest empty extraction", () => {
  // Different meanings: one is a broken turn worth logging, the other is a
  // normal turn where nothing new was said.
  const empty = parseExtraction(payload([]));
  assert.equal(empty.parseFailed, false);
  assert.equal(empty.facts.length, 0);
});

test("fenced JSON is tolerated", () => {
  // Anthropic's structured output is prompt-enforced, so fences are routine.
  const fenced = "```json\n" + one() + "\n```";
  assert.equal(parseExtraction(fenced).facts.length, 1);
  assert.equal(parseExtraction("```\n" + one() + "\n```").facts.length, 1);
});

test("junk entries inside a good array do not poison the rest", () => {
  const result = parseExtraction(
    payload([
      null,
      "nonsense",
      { key: "person.name", value: "Ana", confidence: 0.9, quote: "I'm Ana" },
    ]),
  );
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].value, "Ana");
  assert.equal(result.rejected.filter((r) => r.reason === "malformed").length, 2);
});

// ─── Coercion ─────────────────────────────────────────────────────────────────

test("booleans coerce from natural answers in both languages", () => {
  for (const yes of ["true", "yes", "Y", "si", "Sí"]) {
    assert.equal(coerceValue("business.has_staff", yes), true, yes);
  }
  for (const no of ["false", "no", "N"]) {
    assert.equal(coerceValue("business.has_staff", no), false, no);
  }
  // Anything unconvincing must be undefined, not a default. A "maybe" coerced
  // to false becomes indistinguishable from a real answer once it is a row.
  for (const unclear of ["maybe", "sometimes", "kind of", ""]) {
    assert.equal(coerceValue("business.has_staff", unclear), undefined, unclear);
  }
});

test("numbers take the lower bound of a range, so a seat band is never oversold", () => {
  assert.equal(coerceValue("business.staff_count", "5"), 5);
  assert.equal(coerceValue("business.staff_count", "about 5 people"), 5);
  assert.equal(coerceValue("business.staff_count", "5-6"), 5);
  assert.equal(coerceValue("business.staff_count", "none"), undefined);
});

test("lists split on separators and conjunctions in both languages", () => {
  assert.deepEqual(coerceValue("work.services", "nails, lashes and brows"), [
    "nails",
    "lashes",
    "brows",
  ]);
  assert.deepEqual(coerceValue("work.services", "uñas y pestañas"), ["uñas", "pestañas"]);
});

test("enum coercion normalises spacing and dashes", () => {
  assert.equal(coerceValue("business.works_from", "own premises"), "own_premises");
  assert.equal(coerceValue("business.works_from", "someone-elses-premises"), "someone_elses_premises");
});

test("an already-correctly-typed value is accepted", () => {
  // Models occasionally ignore the stringly-typed instruction.
  assert.equal(coerceValue("business.has_staff", true), true);
  assert.equal(coerceValue("business.staff_count", 4), 4);
});

test("coercion refuses unknown keys", () => {
  assert.equal(coerceValue("nope.nope", "x"), undefined);
});

// ─── Provenance plumbing ──────────────────────────────────────────────────────

test("quotes are kept and truncated, and question context is attached", () => {
  const long = "y".repeat(MAX_QUOTE_CHARS + 50);
  const result = parseExtraction(
    payload([{ key: "person.name", value: "Ana", confidence: 0.8, quote: long }]),
    { questionId: "identity.name", questionVersion: 1 },
  );
  const fact = result.facts[0];
  assert.equal(fact.sourceExcerpt?.length, MAX_QUOTE_CHARS);
  assert.equal(fact.questionId, "identity.name");
  assert.equal(fact.questionVersion, 1);
});

test("an empty quote becomes null rather than an empty string", () => {
  // The Settings surface renders "from your words: ..." only when there is a
  // quote. An empty string would print an empty attribution.
  const result = parseExtraction(one({ quote: "" }));
  assert.equal(result.facts[0].sourceExcerpt, null);
});

// ─── Schema and prompt vocabulary ─────────────────────────────────────────────

test("the schema asks for every field the parser requires", () => {
  const items = (
    EXTRACTION_SCHEMA.schema as {
      properties: { facts: { items: { required: string[] } } };
    }
  ).properties.facts.items.required;
  assert.deepEqual([...items].sort(), ["confidence", "key", "quote", "value"]);
});

test("the schema caps facts per turn", () => {
  const facts = (EXTRACTION_SCHEMA.schema as { properties: { facts: { maxItems: number } } })
    .properties.facts;
  assert.ok(facts.maxItems > 0 && facts.maxItems <= 20);
});

test("the prompt vocabulary is generated from the real key list", () => {
  // A hand-maintained copy in a prompt string falls behind, and the symptom is a
  // fact that can be stored but never extracted.
  const rendered = factVocabularyForPrompt({ allowPhysicalAttributes: true });
  for (const def of FACT_KEYS) {
    assert.ok(rendered.includes(def.key), `${def.key} missing from prompt vocabulary`);
    assert.ok(isKnownFactKey(def.key));
  }
  for (const def of FACT_KEYS) {
    if (def.allowed) {
      assert.ok(rendered.includes(def.allowed[0]), `${def.key} allowed values not rendered`);
    }
  }
});

// ─── Physical attributes are withheld, not merely discouraged ─────────────────

const PHYSICAL_KEYS = [
  "industry.height_cm",
  "industry.measurements",
  "industry.hair_color",
  "industry.eye_color",
];

test("physical attributes are absent from the default prompt vocabulary", () => {
  // Withholding the key IS the enforcement. A prompt instruction asking the
  // model to be careful about somebody's body is not enforcement, and the
  // failure is unrecoverable: nobody can un-store a physical description.
  const rendered = factVocabularyForPrompt();
  for (const key of PHYSICAL_KEYS) {
    assert.equal(rendered.includes(key), false, `${key} must not be offered by default`);
  }
});

test("but present once the modelling pack is active", () => {
  const rendered = factVocabularyForPrompt({ allowPhysicalAttributes: true });
  for (const key of PHYSICAL_KEYS) {
    assert.ok(rendered.includes(key), key);
  }
});

test("a physical attribute proposed without the pack is rejected", () => {
  // The second barrier. The model may produce one from its own priors even
  // having never been offered the key, and defaulting to permissive would make
  // the first barrier the only one.
  const result = parseExtraction(
    payload([
      { key: "industry.height_cm", value: "178", confidence: 0.9, quote: "I'm 1.78" },
      { key: "work.discipline", value: "photographer", confidence: 0.9, quote: "photographer" },
    ]),
  );
  assert.deepEqual(
    result.facts.map((f) => f.factKey),
    ["work.discipline"],
    "the physical attribute is dropped and the rest of the turn survives",
  );
  assert.ok(result.rejected.some((r) => r.reason === "not_offered"));
});

test("and accepted with it", () => {
  const result = parseExtraction(
    payload([{ key: "industry.height_cm", value: "178", confidence: 0.9, quote: "1.78" }]),
    { allowPhysicalAttributes: true },
  );
  assert.deepEqual(
    result.facts.map((f) => f.factKey),
    ["industry.height_cm"],
  );
});

test("non-physical industry facts are always extractable", () => {
  // Someone who volunteers "deep tissue, 60 minutes, from 800 pesos" in their
  // opening sentence must have all three captured, pack or no pack. Craft detail
  // is welcome unprompted; only the body is gated.
  const result = parseExtraction(
    payload([
      { key: "industry.specialties", value: "deep tissue, swedish", confidence: 0.9, quote: "deep tissue" },
      { key: "industry.session_length_minutes", value: "60", confidence: 0.9, quote: "60 minutes" },
      { key: "industry.price_from", value: "800", confidence: 0.8, quote: "from 800" },
    ]),
  );
  assert.equal(result.facts.length, 3);
});

test("a realistic multi-fact turn extracts cleanly", () => {
  // "I'm Sofia, I own Glow Studio in Tulum, four nail artists plus me, I take a
  // cut of each booking." The case the whole flow exists to handle in one turn.
  const result = parseExtraction(
    payload([
      { key: "person.name", value: "Sofia", confidence: 0.95, quote: "I'm Sofia" },
      { key: "business.name", value: "Glow Studio", confidence: 0.95, quote: "I own Glow Studio" },
      { key: "business.exists", value: "true", confidence: 0.9, quote: "I own Glow Studio" },
      { key: "person.city", value: "Tulum", confidence: 0.9, quote: "in Tulum" },
      { key: "business.staff_count", value: "5", confidence: 0.7, quote: "four nail artists plus me" },
      { key: "business.takes_commission", value: "true", confidence: 0.9, quote: "I take a cut" },
      { key: "business.works_from", value: "own_premises", confidence: 0.6, quote: "I own Glow Studio" },
    ]),
  );
  assert.equal(result.rejected.length, 0);
  assert.equal(result.facts.length, 7);
  assert.equal(result.facts.find((f) => f.factKey === "business.staff_count")?.value, 5);
  assert.equal(result.facts.find((f) => f.factKey === "business.takes_commission")?.value, true);
  assert.equal(result.facts.find((f) => f.factKey === "business.works_from")?.value, "own_premises");
});
