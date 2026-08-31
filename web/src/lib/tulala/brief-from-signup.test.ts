/**
 * brief-from-signup.test.ts
 *
 * The classic form is the first writer into the Brief, so the risk it carries is
 * not "does it record enough" but "does it record something the visitor did not
 * say". Every test below is a way a form answer could turn into a claim the user
 * would not recognise.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { factsFromSignup } from "@/lib/tulala/brief-from-signup";
import { normalizeFact } from "@/lib/tulala/brief-store";
import { isKnownFactKey } from "@/lib/tulala/fact-keys";

const base = {
  contactName: "Sofia Rivera",
  businessName: "Glow Studio",
  businessDescription: "Bridal makeup in Tulum for destination weddings.",
  audience: "agency" as const,
  rosterSize: "6-20",
  signupLeadId: "00000000-0000-0000-0000-000000000001",
};

function keyed(facts: ReturnType<typeof factsFromSignup>) {
  return new Map(facts.map((f) => [f.factKey, f.value]));
}

test("everything the form produces is user_stated, never an inference", () => {
  // The form is a set of literal answers. If anything here were an inference it
  // would need approval, and a signup that immediately shows the user four
  // things to confirm about the form they just filled in is broken.
  for (const audience of ["operator", "agency", "organization", "business"] as const) {
    for (const rosterSize of ["1-5", "6-20", "21-50", "50+"]) {
      const facts = factsFromSignup({ ...base, audience, rosterSize });
      for (const f of facts) {
        assert.equal(f.source, "user_stated", `${audience}/${rosterSize}/${f.factKey}`);
      }
    }
  }
});

test("every emitted key is in the vocabulary and every value validates", () => {
  // A typo'd key would be silently dropped by recordFacts, so signup would look
  // like it worked and the brief would be empty. This is the guard for that.
  for (const audience of ["operator", "agency", "organization", "business"] as const) {
    const facts = factsFromSignup({ ...base, audience });
    assert.ok(facts.length > 0);
    for (const f of facts) {
      assert.ok(isKnownFactKey(f.factKey), `unknown key ${f.factKey}`);
      const normalized = normalizeFact(f);
      assert.ok(normalized.ok, `rejected ${f.factKey}: ${!normalized.ok && normalized.error}`);
    }
  }
});

test("a roster of 1-5 does NOT assert that anyone else works there", () => {
  // "1-5" contains 1, and 1 means "just me". Reading it as five people would
  // hand the engine a decisive workspace signal off a truthful sole-trader
  // answer, which is exactly the misclassification the four operating questions
  // exist to prevent.
  const facts = keyed(factsFromSignup({ ...base, audience: "operator", rosterSize: "1-5" }));
  assert.equal(facts.has("business.staff_count"), false);
  assert.equal(facts.has("business.represents_others"), false);
});

test("a roster bucket above one person records its LOWER bound, not its upper", () => {
  // Upper bounds inflate: "6-20" recorded as 20 would push a seven-person studio
  // past the Studio seat cap and recommend Agency.
  assert.equal(keyed(factsFromSignup({ ...base, rosterSize: "6-20" })).get("business.staff_count"), 6);
  assert.equal(keyed(factsFromSignup({ ...base, rosterSize: "21-50" })).get("business.staff_count"), 21);
  assert.equal(keyed(factsFromSignup({ ...base, rosterSize: "50+" })).get("business.staff_count"), 50);
});

test("the local-business audience records represents_others as FALSE, not as absent", () => {
  // False and missing are different to the engine: false is evidence for the
  // staff-resource workspace shape, missing is a question still to ask. The
  // radio is an answer, so it must land as one.
  const facts = keyed(
    factsFromSignup({ ...base, audience: "business", rosterSize: "1-5" }),
  );
  assert.equal(facts.get("business.represents_others"), false);
});

test("an operator is recorded as doing the work, not as working alone", () => {
  // "Works alone" is scored as evidence AGAINST a workspace. An independent
  // operator with three artists is a real case, and the roster question is where
  // that gets settled, so the audience radio must not pre-empt it.
  const facts = keyed(
    factsFromSignup({ ...base, audience: "operator", rosterSize: "1-5" }),
  );
  assert.equal(facts.get("work.performs_service_personally"), true);
  assert.equal(facts.has("business.works_alone"), false);
});

test("naming a business asserts the business exists", () => {
  const facts = keyed(factsFromSignup(base));
  assert.equal(facts.get("business.name"), "Glow Studio");
  assert.equal(facts.get("business.exists"), true);
});

test("a blank description produces no description fact rather than an empty one", () => {
  assert.equal(
    keyed(factsFromSignup({ ...base, businessDescription: "   " })).has(
      "business.description",
    ),
    false,
  );
  assert.equal(
    keyed(factsFromSignup({ ...base, businessDescription: null })).has(
      "business.description",
    ),
    false,
  );
});

test("the description is quoted as the user's own words", () => {
  // source_excerpt is capped and is only ever the USER'S words. It is what makes
  // "you told me this" checkable by the person it is about.
  const facts = factsFromSignup(base);
  const description = facts.find((f) => f.factKey === "business.description");
  assert.ok(description);
  assert.equal(description.sourceExcerpt, base.businessDescription);
});

test("an unrecognised roster bucket is ignored rather than guessed at", () => {
  const facts = keyed(
    factsFromSignup({ ...base, audience: "operator", rosterSize: "several" }),
  );
  assert.equal(facts.has("business.staff_count"), false);
});
