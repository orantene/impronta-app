/**
 * laws.test.ts
 *
 * The restrictive laws are tested directly. The permissive ones cannot be —
 * no single proposal violates "being employed does not disqualify Talent" —
 * so what is tested here is that `checkLaws` does not INVENT a restriction
 * where a permissive law forbids one. Those cases are marked with the law they
 * defend, and the corresponding engine-level tests live with the recommendation
 * engine in Phase 3.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkLaws,
  isLawful,
  LAWS,
  PERMISSIVE_LAWS,
  RESTRICTIVE_LAWS,
  TALENT_PUBLISH_MIN_PHOTOS,
  type StructureProposal,
} from "@/lib/tulala/laws";
import { buildCorePublishRequirements } from "@/lib/field-engine/profile-publish-requirements";

/** A lawful talent-only proposal. Every test starts from something valid. */
const talentOnly = (over: Partial<StructureProposal> = {}): StructureProposal => ({
  createTalentProfile: true,
  createWorkspace: false,
  talentSubjectIsIndividual: true,
  talentDisplayName: "Sofia Ramirez",
  talentNameIsBrandMark: false,
  authenticPersonPhotoCount: 0,
  synthesizePortrait: false,
  publishTalentProfileNow: false,
  hasDistinctOperatingIdentity: false,
  ...over,
});

/** A lawful workspace-only proposal. */
const workspaceOnly = (over: Partial<StructureProposal> = {}): StructureProposal => ({
  createTalentProfile: false,
  createWorkspace: true,
  talentSubjectIsIndividual: null,
  talentDisplayName: null,
  talentNameIsBrandMark: false,
  authenticPersonPhotoCount: 0,
  synthesizePortrait: false,
  publishTalentProfileNow: false,
  hasDistinctOperatingIdentity: true,
  ...over,
});

const ids = (p: StructureProposal) => checkLaws(p).map((v) => v.law);

// ─── The catalog ──────────────────────────────────────────────────────────────

test("every law is in exactly one kind, and both kinds are populated", () => {
  assert.equal(RESTRICTIVE_LAWS.length + PERMISSIVE_LAWS.length, Object.keys(LAWS).length);
  assert.ok(RESTRICTIVE_LAWS.length > 0);
  assert.ok(PERMISSIVE_LAWS.length > 0);
});

test("every violation carries a remedy, not just a refusal", () => {
  // A refusal with no way forward is an abandoned signup.
  const broken = talentOnly({
    talentSubjectIsIndividual: false,
    talentDisplayName: null,
    synthesizePortrait: true,
  });
  const violations = checkLaws(broken);
  assert.ok(violations.length >= 3);
  for (const v of violations) {
    assert.ok(v.remedy.length > 0, `${v.law} has no remedy`);
    assert.ok(v.because.length > 0, `${v.law} has no reason`);
    assert.equal(v.statement, LAWS[v.law].statement);
  }
});

// ─── L1: a Talent is a person ─────────────────────────────────────────────────

test("a salon cannot be a Talent", () => {
  assert.ok(ids(talentOnly({ talentSubjectIsIndividual: false })).includes("L1_TALENT_IS_A_PERSON"));
});

test("an UNESTABLISHED subject also fails L1, rather than being assumed", () => {
  // The case a prompt-only implementation gets wrong: a model that has not
  // established something tends to assume the agreeable answer.
  assert.ok(ids(talentOnly({ talentSubjectIsIndividual: null })).includes("L1_TALENT_IS_A_PERSON"));
});

test("L1 does not fire when no Talent Profile is proposed", () => {
  assert.ok(!ids(workspaceOnly()).includes("L1_TALENT_IS_A_PERSON"));
});

// ─── L2: a person's name, not a logo ──────────────────────────────────────────

test("a brand mark cannot be the Talent display name", () => {
  const v = checkLaws(talentOnly({ talentDisplayName: "Glow Studio", talentNameIsBrandMark: true }));
  const l2 = v.find((x) => x.law === "L2_TALENT_USES_A_PERSON_NAME");
  assert.ok(l2);
  assert.match(l2.because, /Glow Studio/);
  // The remedy must keep the brand rather than discard it.
  assert.match(l2.remedy, /brand on the Workspace/i);
});

test("a missing name fails L2 and a stage name satisfies it", () => {
  assert.ok(ids(talentOnly({ talentDisplayName: "   " })).includes("L2_TALENT_USES_A_PERSON_NAME"));
  assert.ok(!ids(talentOnly({ talentDisplayName: "DJ Nuvo" })).includes("L2_TALENT_USES_A_PERSON_NAME"));
});

// ─── L3: photos gate PUBLISHING, not existing ─────────────────────────────────

test("a photoless draft is lawful — this is what lets conversation come first", () => {
  const draft = talentOnly({ authenticPersonPhotoCount: 0, publishTalentProfileNow: false });
  assert.ok(isLawful(draft), JSON.stringify(checkLaws(draft)));
});

test("publishing without enough authentic photos is not", () => {
  const v = ids(talentOnly({ authenticPersonPhotoCount: 1, publishTalentProfileNow: true }));
  assert.ok(v.includes("L3_PUBLISHABLE_TALENT_NEEDS_AN_AUTHENTIC_PHOTO"));
});

test("the photo floor matches the enforcing publish gate exactly", () => {
  // The drawer already drifted to 1 against this 3. Assert against the real
  // gate rather than restating the number.
  const atFloor = buildCorePublishRequirements({
    stageName: "Sofia",
    primaryType: "makeup",
    homeBase: "Tulum",
    totalPhotos: TALENT_PUBLISH_MIN_PHOTOS,
    activeBioLength: 40,
    languageCount: 1,
  });
  const belowFloor = buildCorePublishRequirements({
    stageName: "Sofia",
    primaryType: "makeup",
    homeBase: "Tulum",
    totalPhotos: TALENT_PUBLISH_MIN_PHOTOS - 1,
    activeBioLength: 40,
    languageCount: 1,
  });
  assert.equal(atFloor.find((r) => r.id === "photos")?.met, true);
  assert.equal(belowFloor.find((r) => r.id === "photos")?.met, false);
});

// ─── L4: never synthesize a face ──────────────────────────────────────────────

test("generating a portrait is never lawful", () => {
  assert.ok(
    ids(talentOnly({ synthesizePortrait: true, authenticPersonPhotoCount: 5 })).includes(
      "L4_NEVER_SYNTHESIZE_A_PORTRAIT",
    ),
  );
});

// ─── L6: side work is not a business ──────────────────────────────────────────

test("a workspace with no distinct identity is refused, with a trigger as the remedy", () => {
  const v = checkLaws(workspaceOnly({ hasDistinctOperatingIdentity: false }));
  const l6 = v.find((x) => x.law === "L6_SIDE_WORK_ALONE_IS_NOT_A_BUSINESS");
  assert.ok(l6);
  // "Fit, not force": the remedy is to record the condition, not to pitch.
  assert.match(l6.remedy, /upgrade trigger/i);
});

test("a real brand satisfies L6 without needing a company", () => {
  // L7: "Maria Wellness" needs no LLC. A distinct identity is the test, not
  // incorporation, and nothing in the proposal asks about legal status.
  assert.ok(isLawful(workspaceOnly({ hasDistinctOperatingIdentity: true })));
  assert.ok(
    !Object.keys(workspaceOnly()).includes("isIncorporated"),
    "the proposal must not acquire a legal-status field",
  );
});

// ─── Permissive laws: the engine must not over-restrict ───────────────────────

test("L5 — an employed person may still be Talent", () => {
  // A therapist at a spa. Nothing about employment appears in the proposal, and
  // that absence is the enforcement: there is no field for the engine to refuse
  // on. This test exists so removing that property is a failing test.
  const employed = talentOnly({ hasDistinctOperatingIdentity: false });
  assert.ok(isLawful(employed));
});

test("L8 — a workspace owner need not be Talent", () => {
  // Carlos runs a six-therapist studio and needs no fake profile of his own.
  assert.ok(isLawful(workspaceOnly({ createTalentProfile: false })));
});

test("L10 — hybrid is lawful and is just both proposals at once", () => {
  const hybrid = talentOnly({ createWorkspace: true, hasDistinctOperatingIdentity: true });
  assert.ok(isLawful(hybrid), JSON.stringify(checkLaws(hybrid)));
});

test("a hybrid is not penalised by L6 for also being a person", () => {
  // The failure mode: treating "has personal work" as evidence AGAINST a real
  // business. Maria owns Luna Wellness and does her own massage work.
  const hybrid = talentOnly({
    createWorkspace: true,
    hasDistinctOperatingIdentity: true,
    talentDisplayName: "Maria Solis",
  });
  assert.ok(!ids(hybrid).includes("L6_SIDE_WORK_ALONE_IS_NOT_A_BUSINESS"));
});
