/**
 * brief-store.test.ts
 *
 * The provenance layer is the whole point of the Brief, so these tests are
 * mostly about one question: can a guess ever end up looking like something the
 * user said? Every case below is a way that could happen.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSnapshot,
  confirmedFacts,
  factsAwaitingApproval,
  factsByCategory,
  factsFromSnapshot,
  listFact,
  MAX_SOURCE_EXCERPT,
  normalizeFact,
  redactFactsForPrompt,
  resolveIncomingConfidence,
  resolveIncomingStatus,
  scorableFacts,
  shouldReplaceFact,
  stringFact,
  type Brief,
  type BriefFact,
  type FactInput,
} from "@/lib/tulala/brief-store";
import {
  FACT_KEYS,
  FACT_VOCABULARY_VERSION,
  factKeyDef,
  isKnownFactKey,
  validateFactValue,
} from "@/lib/tulala/fact-keys";

const fact = (over: Partial<BriefFact> = {}): BriefFact => ({
  factKey: "business.name",
  value: "Luna Wellness",
  source: "user_stated",
  confidence: 1,
  status: "confirmed",
  sourceExcerpt: null,
  sourceUrl: null,
  questionId: null,
  questionVersion: null,
  updatedAt: null,
  ...over,
});

const brief = (facts: BriefFact[]): Brief => ({
  id: "b-1",
  status: "discovering",
  locale: "en",
  currentVersion: 0,
  engineVersion: null,
  profileId: null,
  guestSessionId: "g-1",
  signupLeadId: null,
  talentProfileId: null,
  tenantId: null,
  facts,
  updatedAt: null,
});

const input = (over: Partial<FactInput> = {}): FactInput => ({
  factKey: "business.name",
  value: "Luna Wellness",
  source: "user_stated",
  ...over,
});

// ─── The L20 rule ─────────────────────────────────────────────────────────────

test("a model can propose but never confirm", () => {
  // Decision L20 as behaviour. Also enforced by a CHECK constraint, because this
  // is the rule a future caller is most likely to bypass for convenience.
  assert.equal(resolveIncomingStatus(input({ source: "ai_inference" })), "needs_approval");
  assert.equal(
    resolveIncomingStatus(input({ source: "ai_inference", status: "confirmed" })),
    "needs_approval",
    "asking for confirmed must not grant it",
  );
  assert.equal(
    resolveIncomingStatus(input({ source: "ai_inference", status: "suggested" })),
    "suggested",
  );
});

test("a scraped page is a guess, not testimony", () => {
  // A heading lifted off someone's homepage is a good guess about their business
  // name, not a statement they made to us.
  assert.equal(resolveIncomingStatus(input({ source: "url_import" })), "needs_approval");
  assert.equal(
    resolveIncomingStatus(input({ source: "url_import", status: "confirmed" })),
    "needs_approval",
  );
});

test("what the user said, and what we derived from real objects, need no approval", () => {
  assert.equal(resolveIncomingStatus(input({ source: "user_stated" })), "confirmed");
  assert.equal(resolveIncomingStatus(input({ source: "system_derived" })), "confirmed");
});

test("rejection survives every source", () => {
  for (const source of ["user_stated", "ai_inference", "url_import", "system_derived"] as const) {
    assert.equal(
      resolveIncomingStatus(input({ source, status: "rejected" })),
      "rejected",
      `${source} must be able to be recorded as rejected`,
    );
  }
});

// ─── Confidence ───────────────────────────────────────────────────────────────

test("an unlabelled guess does not arrive as certain", () => {
  // The engine weights by confidence, so defaulting an inference to 1.0 would
  // let a guess outvote a statement.
  assert.equal(resolveIncomingConfidence(input({ source: "user_stated" })), 1);
  assert.equal(resolveIncomingConfidence(input({ source: "system_derived" })), 1);
  assert.ok(resolveIncomingConfidence(input({ source: "url_import" })) < 1);
  assert.ok(resolveIncomingConfidence(input({ source: "ai_inference" })) < 1);
});

test("out-of-range confidence is clamped, not rejected", () => {
  assert.equal(resolveIncomingConfidence(input({ confidence: 4 })), 1);
  assert.equal(resolveIncomingConfidence(input({ confidence: -2 })), 0);
  assert.equal(resolveIncomingConfidence(input({ confidence: Number.NaN })), 1);
});

// ─── Precedence ───────────────────────────────────────────────────────────────

test("the user always wins", () => {
  const guess = fact({ source: "ai_inference", status: "needs_approval", confidence: 0.9 });
  const correction = normalizeFact(input({ value: "Luna Spa" }));
  assert.ok(correction.ok);
  assert.equal(
    shouldReplaceFact(guess, correction.fact),
    true,
    "a correction must replace a guess at any confidence",
  );
});

test("a guess never overwrites something the user said", () => {
  // The failure the entire provenance layer exists to prevent.
  const stated = fact({ source: "user_stated", status: "confirmed", confidence: 1 });
  const guess = normalizeFact(
    input({ value: "Luna Day Spa", source: "ai_inference", confidence: 0.99 }),
  );
  assert.ok(guess.ok);
  assert.equal(shouldReplaceFact(stated, guess.fact), false);
});

test("a guess never overwrites an approved fact", () => {
  // Post-approval, a fact is confirmed but its source may still read as import.
  const approved = fact({ source: "url_import", status: "confirmed", confidence: 1 });
  const guess = normalizeFact(input({ source: "ai_inference", confidence: 0.95 }));
  assert.ok(guess.ok);
  assert.equal(shouldReplaceFact(approved, guess.fact), false);
});

test("between two guesses, the better one wins and a tie changes nothing", () => {
  const weak = fact({ source: "ai_inference", status: "needs_approval", confidence: 0.4 });
  const stronger = normalizeFact(input({ source: "url_import", confidence: 0.8 }));
  const equal = normalizeFact(input({ source: "url_import", confidence: 0.4 }));
  assert.ok(stronger.ok && equal.ok);
  assert.equal(shouldReplaceFact(weak, stronger.fact), true);
  assert.equal(
    shouldReplaceFact(weak, equal.fact),
    false,
    "re-extracting the same value must not churn updated_at",
  );
});

test("a rejected fact is a decision, and only the user reopens it", () => {
  const rejected = fact({ status: "rejected", source: "ai_inference" });
  const guessAgain = normalizeFact(input({ source: "ai_inference", confidence: 1 }));
  const userSaysSo = normalizeFact(input({ source: "user_stated" }));
  assert.ok(guessAgain.ok && userSaysSo.ok);
  assert.equal(
    shouldReplaceFact(rejected, guessAgain.fact),
    false,
    "re-inferring a rejected fact must not resurrect it",
  );
  assert.equal(shouldReplaceFact(rejected, userSaysSo.fact), true);
});

test("an empty slot always accepts a fact", () => {
  const first = normalizeFact(input({ source: "ai_inference" }));
  assert.ok(first.ok);
  assert.equal(shouldReplaceFact(null, first.fact), true);
});

// ─── Validation ───────────────────────────────────────────────────────────────

test("an unknown fact key is refused rather than stored", () => {
  // fact_key is unconstrained in SQL so packs can extend the vocabulary, which
  // makes this the only thing between a typo and an unreadable row.
  const result = normalizeFact(input({ factKey: "buisness.name" }));
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /Unknown fact key/);
});

test("a number arriving as text is rejected, not coerced", () => {
  // Structured model output is well-formed, not correct.
  const bad = validateFactValue("business.staff_count", "three");
  assert.equal(bad.ok, false);
  const good = validateFactValue("business.staff_count", 3);
  assert.equal(good.ok, true);
});

test("an invented enum value is rejected", () => {
  const def = factKeyDef("business.works_from");
  assert.ok(def?.allowed && def.allowed.length > 0);
  assert.equal(validateFactValue("business.works_from", "home").ok, true);
  const invented = validateFactValue("business.works_from", "spaceship");
  assert.equal(invented.ok, false);
  assert.match((invented as { error: string }).error, /not one of/);
});

test("blank and missing values are rejected", () => {
  assert.equal(validateFactValue("business.name", "   ").ok, false);
  assert.equal(validateFactValue("business.name", null).ok, false);
  assert.equal(validateFactValue("business.name", undefined).ok, false);
});

test("a boolean fact will not accept a truthy string", () => {
  assert.equal(validateFactValue("business.has_staff", "yes").ok, false);
  assert.equal(validateFactValue("business.has_staff", true).ok, true);
  assert.equal(validateFactValue("business.has_staff", false).ok, true);
});

test("string values are trimmed and lists drop nothing silently", () => {
  const trimmed = validateFactValue("business.name", "  Luna Wellness  ");
  assert.deepEqual(trimmed, { ok: true, value: "Luna Wellness" });
  const clean = validateFactValue("work.services", [" facial ", "massage"]);
  assert.deepEqual(clean, { ok: true, value: ["facial", "massage"] });
  // A list with a non-string is an error, not a filtered success: silently
  // dropping an item would hide a broken extraction.
  assert.equal(validateFactValue("work.services", ["facial", 7]).ok, false);
});

test("an over-long excerpt is truncated to the DB limit rather than failing", () => {
  const long = "x".repeat(MAX_SOURCE_EXCERPT + 250);
  const result = normalizeFact(input({ sourceExcerpt: long }));
  assert.ok(result.ok);
  assert.equal(result.fact.sourceExcerpt?.length, MAX_SOURCE_EXCERPT);
});

// ─── Vocabulary integrity ─────────────────────────────────────────────────────

test("the vocabulary has no duplicate keys and every key is reachable", () => {
  const keys = FACT_KEYS.map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate fact key in the vocabulary");
  for (const key of keys) {
    assert.ok(isKnownFactKey(key), `${key} must be reachable by lookup`);
    assert.ok(factKeyDef(key), `${key} must resolve to a definition`);
  }
});

test("every fact key has a human label and a category", () => {
  for (const def of FACT_KEYS) {
    assert.ok(def.label.trim().length > 0, `${def.key} needs a label`);
    assert.ok(def.category, `${def.key} needs a category`);
    assert.ok(
      !def.label.endsWith(":"),
      `${def.key} label must not end in a colon (the UI adds layout)`,
    );
  }
});

test("evidence weights stay inside the declared bands", () => {
  // Bands rather than free numbers, so "strong" means the same thing in every
  // pack and an inflated weight is visible in review.
  const allowed = new Set([1, 2, 3, 5, -1, -2, -3, -5]);
  for (const def of FACT_KEYS) {
    if (!def.evidence) continue;
    for (const axis of ["talent", "workspace"] as const) {
      const w = def.evidence[axis];
      if (w === undefined) continue;
      assert.ok(
        allowed.has(w),
        `${def.key}.${axis} weight ${w} is not one of the weak/moderate/strong/decisive bands`,
      );
    }
    if (def.evidence.decisive) {
      assert.ok(
        (def.evidence.workspace ?? 0) >= 5,
        `${def.key} is marked decisive so it must carry decisive weight`,
      );
    }
  }
});

test("at least one fact argues AGAINST a workspace", () => {
  // Without negative evidence, enough weak positives outvote one decisive
  // negative, which is how a solo home worker gets sold a roster plan.
  const negatives = FACT_KEYS.filter((d) => (d.evidence?.workspace ?? 0) < 0);
  assert.ok(
    negatives.length > 0,
    "the vocabulary must be able to express evidence against a workspace",
  );
});

test("the decisive business facts are the ones the plan names", () => {
  const decisive = FACT_KEYS.filter((d) => d.evidence?.decisive).map((d) => d.key);
  for (const key of [
    "business.has_staff",
    "business.represents_others",
    "business.takes_commission",
    "operations.business_receives_bookings",
  ]) {
    assert.ok(decisive.includes(key), `${key} must be decisive business evidence`);
  }
});

// ─── Reading ──────────────────────────────────────────────────────────────────

test("rejected facts are invisible to every reader", () => {
  const b = brief([
    fact({ factKey: "business.name", value: "Luna Wellness" }),
    fact({ factKey: "work.discipline", value: "massage", status: "rejected" }),
  ]);
  assert.equal(scorableFacts(b).length, 1);
  assert.equal(confirmedFacts(b).length, 1);
  assert.equal(stringFact(b, "work.discipline"), null, "a rejected fact must not read back");
});

test("pending facts are scorable but not confirmed", () => {
  const b = brief([
    fact({
      factKey: "work.industry",
      value: "spa",
      source: "ai_inference",
      status: "needs_approval",
      confidence: 0.6,
    }),
  ]);
  assert.equal(scorableFacts(b).length, 1);
  assert.equal(confirmedFacts(b).length, 0);
  assert.equal(factsAwaitingApproval(b).length, 1);
});

test("typed readers refuse a value of the wrong shape", () => {
  const b = brief([fact({ factKey: "business.staff_count", value: "three" })]);
  assert.equal(stringFact(b, "business.staff_count"), "three");
  assert.deepEqual(listFact(b, "business.staff_count"), []);
});

test("categories group facts and omit the empty ones", () => {
  const b = brief([
    fact({ factKey: "person.name", value: "Sofia" }),
    fact({ factKey: "business.name", value: "Glow Studio" }),
  ]);
  const groups = factsByCategory(b);
  assert.deepEqual(
    groups.map((g) => g.category),
    ["identity", "business"],
    "only non-empty categories, in declared order",
  );
});

// ─── Snapshots ────────────────────────────────────────────────────────────────

test("a snapshot carries the whole fact set with provenance", () => {
  const b = brief([
    fact({ factKey: "business.name", value: "Luna Wellness" }),
    fact({
      factKey: "work.industry",
      value: "spa",
      source: "ai_inference",
      status: "needs_approval",
      confidence: 0.6,
    }),
  ]);
  const snap = buildSnapshot(b, FACT_VOCABULARY_VERSION);
  assert.equal(snap.facts.length, 2);
  assert.equal(snap.vocabularyVersion, FACT_VOCABULARY_VERSION);
  const industry = snap.facts.find((f) => f.factKey === "work.industry");
  assert.equal(industry?.source, "ai_inference");
  assert.equal(industry?.status, "needs_approval");
});

test("restoring does not launder an unapproved guess into a confirmed fact", () => {
  // The failure that would make "restore a previous version" a way to bypass
  // approval entirely.
  const b = brief([
    fact({
      factKey: "work.industry",
      value: "spa",
      source: "ai_inference",
      status: "needs_approval",
      confidence: 0.6,
    }),
  ]);
  const restored = factsFromSnapshot(buildSnapshot(b, FACT_VOCABULARY_VERSION));
  assert.equal(restored.length, 1);
  const normalized = normalizeFact(restored[0]!);
  assert.ok(normalized.ok);
  assert.equal(normalized.fact.status, "needs_approval");
  assert.equal(normalized.fact.source, "ai_inference");
});

test("a snapshot from an older vocabulary drops keys that no longer exist", () => {
  const restored = factsFromSnapshot({
    vocabularyVersion: 0,
    engineVersion: null,
    status: "discovering",
    locale: "en",
    facts: [
      {
        factKey: "business.name",
        value: "Luna",
        source: "user_stated",
        confidence: 1,
        status: "confirmed",
        sourceExcerpt: null,
        sourceUrl: null,
      },
      {
        factKey: "retired.key.from.v0",
        value: "whatever",
        source: "user_stated",
        confidence: 1,
        status: "confirmed",
        sourceExcerpt: null,
        sourceUrl: null,
      },
    ],
  });
  assert.deepEqual(restored.map((f) => f.factKey), ["business.name"]);
});

test("a malformed snapshot restores nothing instead of throwing", () => {
  assert.deepEqual(factsFromSnapshot(null as never), []);
  assert.deepEqual(factsFromSnapshot({} as never), []);
});

// ─── Redaction ────────────────────────────────────────────────────────────────

test("names never reach a classification prompt", () => {
  // Whether she needs a workspace depends on whether she takes a cut, not on
  // what she is called.
  const facts = [
    fact({ factKey: "person.name", value: "Sofia Ramirez" }),
    fact({ factKey: "person.professional_name", value: "Sofia R" }),
    fact({ factKey: "business.takes_commission", value: true }),
  ];
  const redacted = redactFactsForPrompt(facts);
  const keys = redacted.map((f) => f.factKey);
  assert.ok(!keys.includes("person.name"));
  assert.ok(!keys.includes("person.professional_name"));
  assert.ok(keys.includes("business.takes_commission"));
  assert.equal(
    JSON.stringify(redacted).includes("Sofia"),
    false,
    "no personal value may survive redaction in any form",
  );
});

test("redaction keeps provenance so the model can weigh what it is told", () => {
  const redacted = redactFactsForPrompt([
    fact({
      factKey: "work.industry",
      value: "spa",
      source: "ai_inference",
      confidence: 0.5,
      status: "needs_approval",
    }),
  ]);
  assert.equal(redacted[0]?.source, "ai_inference");
  assert.equal(redacted[0]?.confidence, 0.5);
});
