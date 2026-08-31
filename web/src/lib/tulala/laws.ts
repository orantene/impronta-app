/**
 * laws.ts — the product laws of Talent and Workspace, as code.
 *
 * WHY A MODULE AND NOT A PROMPT
 * ─────────────────────────────
 * These ten rules decide what the intake is allowed to create. Written into a
 * system prompt they would be advisory: a model that has been told "a Talent is
 * always a person" will still, given a persuasive enough conversation, propose a
 * Talent Profile for a salon. Written here they are a gate the proposal has to
 * pass, and a violation is a returned value the caller must handle rather than a
 * tone the model may drift out of.
 *
 * A second reason: prompt text cannot be diffed against behaviour. A law here
 * has a test, an id that appears in logs, and a version that survives a reworded
 * question.
 *
 * TWO KINDS OF LAW
 * ────────────────
 * The ten split cleanly, and the split matters because only one kind is
 * checkable against a single proposal:
 *
 *   RESTRICTIVE laws forbid a proposal. "A company is never a Talent." Given a
 *   proposal, you can look at it and say yes or no. `checkLaws` does this.
 *
 *   PERMISSIVE laws forbid a *requirement*. "Being employed does not prevent
 *   someone from being Talent." No single proposal violates that; an engine
 *   violates it, by refusing a case it should have accepted. These cannot be
 *   checked here, so they are declared here and enforced by tests that feed the
 *   recommendation engine the exact cases the law protects. `PERMISSIVE_LAWS`
 *   exists so those tests can be traced back to the rule they defend, and so a
 *   future reader cannot mistake "not checked" for "not real".
 *
 * The distinction is the whole reason this file does not simply return a
 * boolean. An over-restrictive engine and an under-restrictive one are both
 * broken, and only one of them shows up as a rejected proposal.
 */

// ─── Catalog ──────────────────────────────────────────────────────────────────

export type LawId =
  | "L1_TALENT_IS_A_PERSON"
  | "L2_TALENT_USES_A_PERSON_NAME"
  | "L3_PUBLISHABLE_TALENT_NEEDS_AN_AUTHENTIC_PHOTO"
  | "L4_NEVER_SYNTHESIZE_A_PORTRAIT"
  | "L5_EMPLOYMENT_DOES_NOT_DISQUALIFY_TALENT"
  | "L6_SIDE_WORK_ALONE_IS_NOT_A_BUSINESS"
  | "L7_WORKSPACE_IS_AN_OPERATION_NOT_A_CORPORATION"
  | "L8_WORKSPACE_OWNER_NEED_NOT_BE_TALENT"
  | "L9_TALENT_MAY_BELONG_TO_MANY_WORKSPACES"
  | "L10_HYBRID_IS_A_RELATIONSHIP_NOT_A_TYPE";

export type LawKind = "restrictive" | "permissive";

export type Law = {
  id: LawId;
  kind: LawKind;
  /** The rule, in the words it was agreed in. Safe to show a human. */
  statement: string;
};

export const LAWS: Record<LawId, Law> = {
  L1_TALENT_IS_A_PERSON: {
    id: "L1_TALENT_IS_A_PERSON",
    kind: "restrictive",
    statement:
      "A Talent is always a person. A company, salon, band, agency or studio is never a Talent.",
  },
  L2_TALENT_USES_A_PERSON_NAME: {
    id: "L2_TALENT_USES_A_PERSON_NAME",
    kind: "restrictive",
    statement:
      "A Talent uses a person's professional identity, real or stage name. A logo never replaces it.",
  },
  L3_PUBLISHABLE_TALENT_NEEDS_AN_AUTHENTIC_PHOTO: {
    id: "L3_PUBLISHABLE_TALENT_NEEDS_AN_AUTHENTIC_PHOTO",
    kind: "restrictive",
    statement:
      "A publishable Talent Profile requires an authentic photo of that person. The account and the draft may exist without one; Discover and completeness may not.",
  },
  L4_NEVER_SYNTHESIZE_A_PORTRAIT: {
    id: "L4_NEVER_SYNTHESIZE_A_PORTRAIT",
    kind: "restrictive",
    statement:
      "Never generate a synthetic portrait as a substitute for a real photo. AI may crop, clean, or reformat a supplied photograph. Identity stays authentic.",
  },
  L5_EMPLOYMENT_DOES_NOT_DISQUALIFY_TALENT: {
    id: "L5_EMPLOYMENT_DOES_NOT_DISQUALIFY_TALENT",
    kind: "permissive",
    statement:
      "Being employed does not prevent someone from being Talent. A therapist at a spa, a singer at a hotel, a chef at a restaurant may all sell personal work.",
  },
  L6_SIDE_WORK_ALONE_IS_NOT_A_BUSINESS: {
    id: "L6_SIDE_WORK_ALONE_IS_NOT_A_BUSINESS",
    kind: "restrictive",
    statement:
      "Side work alone does not make someone a Business. The test is whether a distinct operating or brand identity exists.",
  },
  L7_WORKSPACE_IS_AN_OPERATION_NOT_A_CORPORATION: {
    id: "L7_WORKSPACE_IS_AN_OPERATION_NOT_A_CORPORATION",
    kind: "permissive",
    statement:
      'A Workspace represents an operation, not necessarily a corporation. "Maria Wellness" needs no LLC.',
  },
  L8_WORKSPACE_OWNER_NEED_NOT_BE_TALENT: {
    id: "L8_WORKSPACE_OWNER_NEED_NOT_BE_TALENT",
    kind: "permissive",
    statement: "A Workspace can exist with an owner who is not Talent.",
  },
  L9_TALENT_MAY_BELONG_TO_MANY_WORKSPACES: {
    id: "L9_TALENT_MAY_BELONG_TO_MANY_WORKSPACES",
    kind: "permissive",
    statement:
      "A Talent can belong to multiple Workspaces, subject to representation rules.",
  },
  L10_HYBRID_IS_A_RELATIONSHIP_NOT_A_TYPE: {
    id: "L10_HYBRID_IS_A_RELATIONSHIP_NOT_A_TYPE",
    kind: "permissive",
    statement: "Hybrid is a relationship, not an account type.",
  },
};

export const RESTRICTIVE_LAWS: readonly Law[] = Object.values(LAWS).filter(
  (l) => l.kind === "restrictive",
);

/**
 * The laws no single proposal can violate, listed so the tests that defend them
 * can name them. Each one describes a case the engine must ACCEPT; the failure
 * mode is a refusal, not a bad proposal.
 */
export const PERMISSIVE_LAWS: readonly Law[] = Object.values(LAWS).filter(
  (l) => l.kind === "permissive",
);

// ─── The proposal under test ──────────────────────────────────────────────────

/**
 * What the intake wants to create, described in terms the laws can judge.
 *
 * Every field is evidence the conversation produced, not a taxonomy answer. The
 * intake never asks "are you a person?"; it asks what someone does and fills
 * this in.
 */
export type StructureProposal = {
  createTalentProfile: boolean;
  createWorkspace: boolean;

  /**
   * Is the subject of the proposed Talent Profile an individual human?
   * False for a salon, band, agency, or studio presenting itself as one.
   * Null when the conversation has not established it — which is itself a
   * blocker for creating a Talent Profile, since L1 cannot be assumed.
   */
  talentSubjectIsIndividual: boolean | null;

  /** The name the Talent Profile would carry. Real or stage name both fine. */
  talentDisplayName: string | null;

  /**
   * True when the only name offered is a brand/logo mark rather than a person.
   * "Glow Studio" as a Talent display name is this case.
   */
  talentNameIsBrandMark: boolean;

  /** Photos of the actual person, supplied by them. Not AI-generated. */
  authenticPersonPhotoCount: number;

  /** True when the plan is to render a face rather than use a supplied one. */
  synthesizePortrait: boolean;

  /** Would this Talent Profile be published (public/Discover) on creation? */
  publishTalentProfileNow: boolean;

  /**
   * Does a distinct operating or brand identity exist — a separate business
   * name, a logo, a business social account, a domain, staff, or bookings the
   * operation receives independently of the person?
   *
   * This is the L6 test. Doing paid work on the side is not this.
   */
  hasDistinctOperatingIdentity: boolean;
};

export type LawViolation = {
  law: LawId;
  statement: string;
  /** Why this specific proposal violates it, in words a human can act on. */
  because: string;
  /**
   * What the intake should do instead. Present because a violation with no
   * remedy becomes a dead end in the conversation, and a dead end at signup is
   * an abandoned signup.
   */
  remedy: string;
};

// ─── The gate ─────────────────────────────────────────────────────────────────

/**
 * Check a proposal against every restrictive law.
 *
 * Returns all violations rather than the first, because the intake shows the
 * user one consolidated correction and asking twice for the same reason is how
 * a conversation starts to feel like a form.
 */
export function checkLaws(proposal: StructureProposal): LawViolation[] {
  const violations: LawViolation[] = [];

  if (proposal.createTalentProfile) {
    // L1. Note that `null` fails: the law is that a Talent IS a person, so an
    // unestablished subject is not permission to proceed. This is the case a
    // prompt-only implementation gets wrong, because a model that has not
    // established something tends to assume the agreeable answer.
    if (proposal.talentSubjectIsIndividual !== true) {
      violations.push({
        law: "L1_TALENT_IS_A_PERSON",
        statement: LAWS.L1_TALENT_IS_A_PERSON.statement,
        because:
          proposal.talentSubjectIsIndividual === false
            ? "the subject of this profile is an organisation, not a person"
            : "the conversation has not established that the subject is a person",
        remedy: proposal.createWorkspace
          ? "create the Workspace only, and add a Talent Profile later for a named individual"
          : "create a Workspace for the operation, and a Talent Profile only for a named individual",
      });
    }

    // L2.
    const name = proposal.talentDisplayName?.trim() ?? "";
    if (name.length === 0) {
      violations.push({
        law: "L2_TALENT_USES_A_PERSON_NAME",
        statement: LAWS.L2_TALENT_USES_A_PERSON_NAME.statement,
        because: "no professional name was captured for the person",
        remedy: "ask what name they work under, real or stage",
      });
    } else if (proposal.talentNameIsBrandMark) {
      violations.push({
        law: "L2_TALENT_USES_A_PERSON_NAME",
        statement: LAWS.L2_TALENT_USES_A_PERSON_NAME.statement,
        because: `"${name}" is a brand name, not a person's professional identity`,
        remedy:
          "keep the brand on the Workspace and ask for the person's own working name for the profile",
      });
    }

    // L3 — a gate on PUBLISHING, deliberately not on existing. The draft is
    // allowed to be empty; that is what lets the conversation come first.
    if (proposal.publishTalentProfileNow && proposal.authenticPersonPhotoCount < TALENT_PUBLISH_MIN_PHOTOS) {
      violations.push({
        law: "L3_PUBLISHABLE_TALENT_NEEDS_AN_AUTHENTIC_PHOTO",
        statement: LAWS.L3_PUBLISHABLE_TALENT_NEEDS_AN_AUTHENTIC_PHOTO.statement,
        because: `publishing was requested with ${proposal.authenticPersonPhotoCount} authentic photo(s); the floor is ${TALENT_PUBLISH_MIN_PHOTOS}`,
        remedy:
          "create the profile as a draft and treat photos as a publishing step, not a signup step",
      });
    }

    // L4.
    if (proposal.synthesizePortrait) {
      violations.push({
        law: "L4_NEVER_SYNTHESIZE_A_PORTRAIT",
        statement: LAWS.L4_NEVER_SYNTHESIZE_A_PORTRAIT.statement,
        because: "the proposal would generate a face instead of using a supplied photograph",
        remedy: "ask for a real photo; offer to crop or clean one they already have",
      });
    }
  }

  // L6 — the business test. Runs only when a Workspace is the ONLY thing being
  // created for someone with no distinct identity. A hybrid proposal is not a
  // violation: someone with a real brand AND personal work gets both.
  if (proposal.createWorkspace && !proposal.hasDistinctOperatingIdentity) {
    violations.push({
      law: "L6_SIDE_WORK_ALONE_IS_NOT_A_BUSINESS",
      statement: LAWS.L6_SIDE_WORK_ALONE_IS_NOT_A_BUSINESS.statement,
      because:
        "no separate operating or brand identity was found — no business name, logo, business account, domain, staff, or independent bookings",
      remedy:
        "recommend a Talent Profile and record a Workspace as an upgrade trigger for when a brand actually appears",
    });
  }

  return violations;
}

/**
 * The authentic-photo floor for publishing a Talent Profile.
 *
 * Mirrors `buildCorePublishRequirements` in
 * `@/lib/field-engine/profile-publish-requirements`, which is the enforcing
 * gate. Kept as a named constant so the two can be asserted equal rather than
 * silently drifting — the new-talent drawer already drifted to 1 against this 3.
 */
export const TALENT_PUBLISH_MIN_PHOTOS = 3;

/** True when a proposal breaks nothing. Convenience for call sites. */
export function isLawful(proposal: StructureProposal): boolean {
  return checkLaws(proposal).length === 0;
}
