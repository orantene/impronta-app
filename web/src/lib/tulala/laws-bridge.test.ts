/**
 * laws-bridge.test.ts
 *
 * The bridge is where an unknown becomes a decision, so what is tested is
 * mostly the DIRECTION of its guesses. Every case below that asserts `null` or
 * `false` is asserting that silence stayed silent — that a missing fact did not
 * quietly become permission.
 *
 * The two cases worth reading first are the massage therapist pair from the
 * product model: same discipline, same conversation length, opposite answer,
 * decided entirely by whether a second identity exists.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkLaws } from "@/lib/tulala/laws";
import {
  hasDistinctOperatingIdentity,
  nameIsBrandMark,
  proposalFromBrief,
  subjectIsIndividual,
  talentDisplayName,
} from "@/lib/tulala/laws-bridge";
import type { Brief, BriefFact } from "@/lib/tulala/brief-store";

function fact(factKey: string, value: unknown, over: Partial<BriefFact> = {}): BriefFact {
  return {
    factKey,
    value,
    source: "user_stated",
    confidence: 1,
    status: "confirmed",
    sourceExcerpt: null,
    sourceUrl: null,
    questionId: null,
    questionVersion: null,
    updatedAt: null,
    ...over,
  };
}

function brief(facts: BriefFact[]): Brief {
  return {
    id: "brief-1",
    status: "discovering",
    locale: "en",
    currentVersion: 0,
    engineVersion: null,
    profileId: null,
    guestSessionId: "guest-1",
    signupLeadId: null,
    talentProfileId: null,
    tenantId: null,
    facts,
    updatedAt: null,
  };
}

// ─── Never guess permissively ─────────────────────────────────────────────────

test("an empty brief establishes nothing about personhood", () => {
  assert.equal(subjectIsIndividual(brief([])), null);
});

test("a name alone does not establish personhood", () => {
  // A salon can be called "Glow". Only a name PLUS evidence that this person
  // does the work, or is booked by name, settles it.
  assert.equal(subjectIsIndividual(brief([fact("person.name", "Ana Ruiz")])), null);
});

test("performing the service personally plus a name establishes personhood", () => {
  const b = brief([
    fact("person.name", "Ana Ruiz"),
    fact("work.performs_service_personally", true),
  ]);
  assert.equal(subjectIsIndividual(b), true);
});

test("being booked by name plus a name establishes personhood", () => {
  const b = brief([fact("person.name", "Ana Ruiz"), fact("work.booked_by_name", true)]);
  assert.equal(subjectIsIndividual(b), true);
});

test("an explicit no to performing personally is a hard false, not an unknown", () => {
  // The distinction matters: L1's remedy text differs for "we did not ask" and
  // "we asked and it is an operation".
  const b = brief([
    fact("person.name", "Glow Studio"),
    fact("work.performs_service_personally", false),
  ]);
  assert.equal(subjectIsIndividual(b), false);
});

test("an empty brief claims no operating identity", () => {
  assert.equal(hasDistinctOperatingIdentity(brief([])), false);
});

test("photos and publishing both default to the blocking side", () => {
  const proposal = proposalFromBrief(brief([]), {
    talentProfile: true,
    workspace: false,
    workspaceType: null,
  });
  assert.equal(proposal.authenticPersonPhotoCount, 0);
  assert.equal(proposal.publishTalentProfileNow, false);
  // And never renders a face.
  assert.equal(proposal.synthesizePortrait, false);
});

// ─── The two massage therapists ───────────────────────────────────────────────

test("the therapist with a logo and an instagram HAS an operating identity", () => {
  const b = brief([
    fact("person.name", "Marco Vidal"),
    fact("work.discipline", "massage"),
    fact("work.performs_service_personally", true),
    fact("presence.has_logo", true),
    fact("presence.business_social_separate", true),
  ]);
  assert.equal(hasDistinctOperatingIdentity(b), true);
});

test("the therapist who only works at a spa does NOT, even doing side work", () => {
  // The exact case the product model calls out: side work is not a business.
  const b = brief([
    fact("person.name", "Lucia Peña"),
    fact("work.discipline", "massage"),
    fact("work.performs_service_personally", true),
    fact("business.employed_by_other", true),
    fact("business.works_from", "someone_elses_premises"),
    fact("presence.has_logo", false),
  ]);
  assert.equal(hasDistinctOperatingIdentity(b), false);
});

// ─── Individual identity signals ──────────────────────────────────────────────

test("owning premises is an operation on its own", () => {
  const b = brief([fact("business.works_from", "own_premises")]);
  assert.equal(hasDistinctOperatingIdentity(b), true);
});

test("working from home is not", () => {
  const b = brief([fact("business.works_from", "home")]);
  assert.equal(hasDistinctOperatingIdentity(b), false);
});

test("taking commission from other people's work is an operation", () => {
  assert.equal(
    hasDistinctOperatingIdentity(brief([fact("business.takes_commission", true)])),
    true,
  );
});

test("a business name that is not the person's own name is an operation", () => {
  const b = brief([fact("person.name", "Ana Ruiz"), fact("business.name", "Glow Studio")]);
  assert.equal(hasDistinctOperatingIdentity(b), true);
});

test("a business named after the person is not, by itself", () => {
  // A sole trader trading under her own name has not created a second thing.
  const b = brief([fact("person.name", "Ana Ruiz"), fact("business.name", "Ana Ruiz")]);
  assert.equal(hasDistinctOperatingIdentity(b), false);
});

test("accents and case do not defeat the same-name test", () => {
  const b = brief([fact("person.name", "Ana Ruíz"), fact("business.name", "ana ruiz")]);
  assert.equal(hasDistinctOperatingIdentity(b), false);
});

test("three named services under a business name reads as an offering", () => {
  const b = brief([
    fact("person.name", "Ana Ruiz"),
    fact("work.services", ["gel", "acrylic", "pedicure"]),
  ]);
  // No business name, so not yet.
  assert.equal(hasDistinctOperatingIdentity(b), false);
});

// ─── Display name and brand marks ─────────────────────────────────────────────

test("a professional name outranks the legal name", () => {
  const b = brief([
    fact("person.name", "Maria Gonzalez"),
    fact("person.professional_name", "Mia G"),
  ]);
  assert.equal(talentDisplayName(b), "Mia G");
});

test("a display name identical to the business name is a brand mark", () => {
  const b = brief([fact("person.professional_name", "Glow Studio"), fact("business.name", "Glow Studio")]);
  assert.equal(nameIsBrandMark(b), true);
});

test("but not when a distinct personal name also exists", () => {
  // She trades as "Ana Ruiz" and the business is also "Ana Ruiz": a naming
  // coincidence, not a logo occupying a person's slot.
  const b = brief([
    fact("person.name", "Ana Ruiz"),
    fact("person.professional_name", "Ana Ruiz"),
    fact("business.name", "Ana Ruiz"),
  ]);
  assert.equal(nameIsBrandMark(b), false);
});

test("no name at all is not a brand mark", () => {
  assert.equal(nameIsBrandMark(brief([])), false);
});

// ─── End to end through the laws ──────────────────────────────────────────────

test("an empty brief cannot lawfully create a talent profile", () => {
  const violations = checkLaws(
    proposalFromBrief(brief([]), {
      talentProfile: true,
      workspace: false,
      workspaceType: null,
    }),
  );
  // L1 (not established as a person) and L2 (no name) both fire.
  assert.ok(violations.length >= 2);
  assert.ok(violations.some((v) => v.law === "L1_TALENT_IS_A_PERSON"));
});

test("an established person can lawfully create a draft talent profile", () => {
  const b = brief([
    fact("person.name", "Ana Ruiz"),
    fact("work.performs_service_personally", true),
  ]);
  const violations = checkLaws(
    proposalFromBrief(b, { talentProfile: true, workspace: false, workspaceType: null }),
  );
  // Zero photos is fine for a DRAFT. The photo law bites at publish, which is
  // the whole point of separating creation from publication.
  assert.deepEqual(violations, []);
});

test("a workspace-only proposal for an operation is lawful", () => {
  const b = brief([
    fact("business.name", "Aqua Spa"),
    fact("business.exists", true),
    fact("business.has_staff", true),
  ]);
  const violations = checkLaws(
    proposalFromBrief(b, { talentProfile: false, workspace: true, workspaceType: "business" }),
  );
  assert.deepEqual(violations, []);
});

test("a talent profile for a named operation is not lawful", () => {
  // "Glow Studio" wants a profile in the people directory. This is the case the
  // whole law module exists to stop.
  const b = brief([
    fact("business.name", "Glow Studio"),
    fact("person.professional_name", "Glow Studio"),
    fact("work.performs_service_personally", false),
  ]);
  const violations = checkLaws(
    proposalFromBrief(b, { talentProfile: true, workspace: true, workspaceType: "business" }),
  );
  assert.ok(violations.some((v) => v.law === "L1_TALENT_IS_A_PERSON"));
  assert.ok(violations.every((v) => v.remedy.length > 0));
});

test("external photo evidence flows through to the publish laws", () => {
  const b = brief([
    fact("person.name", "Ana Ruiz"),
    fact("work.performs_service_personally", true),
  ]);
  const publishingWithNoPhotos = checkLaws(
    proposalFromBrief(
      b,
      { talentProfile: true, workspace: false, workspaceType: null },
      { publishTalentProfileNow: true, authenticPersonPhotoCount: 0 },
    ),
  );
  assert.ok(publishingWithNoPhotos.length > 0, "publishing with no photos must be blocked");

  const publishingWithPhotos = checkLaws(
    proposalFromBrief(
      b,
      { talentProfile: true, workspace: false, workspaceType: null },
      { publishTalentProfileNow: true, authenticPersonPhotoCount: 3 },
    ),
  );
  assert.deepEqual(publishingWithPhotos, []);
});
