/**
 * Tests for the question bank.
 *
 * Two kinds of assertion here, and the second kind is the reason the file
 * exists:
 *
 *  1. Selection behaves — skipping, gating, re-ask caps, decisive ordering.
 *  2. The bank stays MEASURABLE — ids unique, targets in the vocabulary, both
 *     locales present, versions sane. Every one of these is a silent corruption
 *     of the learning loop if it breaks: a duplicate id merges two questions'
 *     metrics, a target outside the vocabulary makes a question unsatisfiable
 *     forever, and a missing locale means Spanish speakers get English.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  QUESTIONS,
  QUESTION_BANK_VERSION,
  STAGES,
  allTargetedFactKeys,
  missingDecisiveQuestions,
  nextQuestion,
  questionById,
  questionPool,
  questionsInStage,
  stageProgress,
  unknownTargets,
} from "./questions";
import { INDUSTRY_PACKS } from "./industry-packs";
import { isKnownFactKey } from "./fact-keys";

// ─── Integrity ────────────────────────────────────────────────────────────────

test("question ids are unique", () => {
  const ids = QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id merges two questions' metrics");
});

test("every target is a real fact key", () => {
  assert.deepEqual(
    unknownTargets(),
    [],
    "a target outside the vocabulary can never be satisfied, so the question asks forever",
  );
  for (const key of allTargetedFactKeys()) {
    assert.ok(isKnownFactKey(key), key);
  }
});

test("every question has both locales and a non-empty phrasing", () => {
  for (const q of QUESTIONS) {
    for (const locale of ["en", "es"] as const) {
      const phrasing = q.phrasing[locale];
      assert.ok(phrasing, `${q.id} missing ${locale}`);
      assert.ok(phrasing.text.trim().length > 0, `${q.id}.${locale} empty`);
    }
  }
});

test("versions are positive integers", () => {
  assert.ok(Number.isInteger(QUESTION_BANK_VERSION) && QUESTION_BANK_VERSION > 0);
  for (const q of QUESTIONS) {
    assert.ok(Number.isInteger(q.version) && q.version > 0, q.id);
  }
});

test("every core stage has at least one question", () => {
  // `specifics` is the exception BY DESIGN: it holds industry-pack questions
  // only, so it is empty in the core bank and populated exactly when a pack
  // matched. Asserted as an explicit exception rather than by loosening the rule,
  // so a second accidentally-empty stage still fails.
  for (const stage of STAGES) {
    if (stage === "specifics") {
      assert.equal(questionsInStage(stage).length, 0, "specifics must be pack-only");
      continue;
    }
    assert.ok(questionsInStage(stage).length > 0, `stage ${stage} is empty`);
  }
});

test("a matched pack fills the specifics stage", () => {
  const pack = INDUSTRY_PACKS[0]!;
  const withPack = questionPool(pack).filter((q) => q.stage === "specifics");
  assert.ok(withPack.length > 0, "the pack contributes questions");
  assert.equal(
    questionPool(null).filter((q) => q.stage === "specifics").length,
    0,
    "and contributes none when no pack matched",
  );
});

test("question id prefix matches its stage", () => {
  // Not cosmetic: the id is what appears in analytics, and a stage read off the
  // id has to agree with the stage used for ordering or the funnel lies.
  for (const q of QUESTIONS) {
    assert.equal(q.id.split(".")[0], q.stage, q.id);
  }
});

test("lookup by id round-trips", () => {
  for (const q of QUESTIONS) {
    assert.equal(questionById(q.id), q);
  }
  assert.equal(questionById("nope.nope"), null);
});

// ─── The four operating questions are all present and flagged ─────────────────

test("the decisive set covers what actually picks the product", () => {
  const decisive = new Set(QUESTIONS.filter((q) => q.decisive).map((q) => q.id));
  // These four are the difference between Free and Studio. If one stops being
  // decisive, the engine starts guessing at what someone pays.
  for (const id of [
    "structure.works_from",
    "structure.others_involved",
    "structure.arrangement",
    "structure.who_do_clients_choose",
  ]) {
    assert.ok(decisive.has(id), `${id} must stay decisive`);
  }
});

// ─── Selection ────────────────────────────────────────────────────────────────

test("opens with the open-ended net, not an interrogation", () => {
  const first = nextQuestion(new Set(), []);
  assert.equal(first?.id, "discovery.opening");
  assert.equal(first?.open, true);
});

test("the opening question is done once asked, since it targets nothing", () => {
  const next = nextQuestion(new Set(), [{ questionId: "discovery.opening", asks: 1 }]);
  assert.notEqual(next?.id, "discovery.opening");
});

test("a question whose targets are all known is skipped entirely", () => {
  // The whole point of `targets`: someone who volunteers their name and city in
  // the opening sentence is never asked for them.
  const known = new Set(["person.name", "person.professional_name"]);
  const asked = [{ questionId: "discovery.opening", asks: 1 }];
  let cursor = nextQuestion(known, asked);
  assert.notEqual(cursor?.id, "identity.name");
  assert.equal(cursor?.id, "identity.city");

  cursor = nextQuestion(new Set([...known, "person.city", "person.country"]), asked);
  assert.equal(cursor?.stage, "work");
});

test("PARTIAL satisfaction still asks", () => {
  // A question targeting three facts that produced one has two left to get.
  // Treating partial as done is how the intake silently stops learning.
  const known = new Set(["work.discipline"]);
  const next = nextQuestion(known, [{ questionId: "discovery.opening", asks: 1 }]);
  assert.equal(next?.id, "identity.name");
  const stillWanted = questionById("work.what_you_do");
  assert.ok(stillWanted);
  assert.ok(!stillWanted.targets.every((t) => known.has(t)));
});

test("askWhen gates the money question behind knowing someone else exists", () => {
  const asked = QUESTIONS.map((q) => ({ questionId: q.id, asks: 0 }));
  const arrangement = questionById("structure.arrangement");
  assert.ok(arrangement?.askWhen);
  assert.equal(arrangement.askWhen(new Set()), false);
  assert.equal(arrangement.askWhen(new Set(["business.has_staff"])), true);
  assert.equal(arrangement.askWhen(new Set(["business.represents_others"])), true);
  void asked;
});

test("decisive questions come first inside their stage", () => {
  const known = new Set([
    "person.name",
    "person.professional_name",
    "person.city",
    "person.country",
    "work.discipline",
    "work.industry",
    "work.services",
    "work.booked_by_name",
    "work.performs_service_personally",
  ]);
  const next = nextQuestion(known, [{ questionId: "discovery.opening", asks: 1 }]);
  assert.equal(next?.stage, "structure");
  assert.equal(next?.decisive, true);
});

test("a question is dropped after the re-ask cap", () => {
  // Two asks then move on. Asking a third time reads as not listening, which is
  // worse than a missing fact.
  const asked = [
    { questionId: "discovery.opening", asks: 1 },
    { questionId: "identity.name", asks: 2 },
  ];
  const next = nextQuestion(new Set(), asked);
  assert.notEqual(next?.id, "identity.name");
});

test("returns null when everything askable is satisfied", () => {
  const known = new Set(allTargetedFactKeys());
  const asked = QUESTIONS.map((q) => ({ questionId: q.id, asks: 1 }));
  assert.equal(nextQuestion(known, asked), null);
});

// ─── Reporting ────────────────────────────────────────────────────────────────

test("missingDecisiveQuestions respects gating, so it never demands the impossible", () => {
  // With nothing known, the arrangement question is not yet askable and must not
  // be reported as missing. Otherwise the approval screen tells a sole trader
  // she has failed to answer a question she was never shown.
  const missing = missingDecisiveQuestions(new Set()).map((q) => q.id);
  assert.ok(missing.includes("structure.works_from"));
  assert.ok(!missing.includes("structure.arrangement"));

  const withStaff = missingDecisiveQuestions(new Set(["business.has_staff"])).map((q) => q.id);
  assert.ok(withStaff.includes("structure.arrangement"));
});

test("stageProgress counts satisfied questions per stage", () => {
  const progress = stageProgress(new Set(["person.name", "person.professional_name"]));
  const identity = progress.find((p) => p.stage === "identity");
  assert.equal(identity?.satisfied, 1);
  assert.ok((identity?.total ?? 0) >= 2);
  assert.equal(progress.length, STAGES.length);
});

test("selection is deterministic", () => {
  const known = new Set(["person.name"]);
  const asked = [{ questionId: "discovery.opening", asks: 1 }];
  const a = nextQuestion(known, asked);
  const b = nextQuestion(known, asked);
  assert.equal(a?.id, b?.id);
});
