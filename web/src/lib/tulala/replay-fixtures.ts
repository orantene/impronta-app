/**
 * replay-fixtures.ts — the engine's regression corpus.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The engine is a pure function of (facts, catalog). That property is worth
 * nothing unless something exercises it: without a corpus, every rule change is
 * shipped on the author's belief that they only affected the case in front of
 * them. With one, `npm run tulala:replay` answers "what else did that move?"
 * before the commit rather than after a churned signup.
 *
 * The four worked cases from the plan are here as literals, plus the edges that
 * have actually been got wrong during implementation — the salaried-staff spa
 * (roster seats vs headcount) and the hybrid (one plan at signup). A case earns
 * its place here by having been a bug, or by being a shape the business must not
 * misprice.
 *
 * PLAIN FACT LITERALS ON PURPOSE
 * ──────────────────────────────
 * No database, no fixtures loaded from JSON, no recorded conversations. A
 * fixture that needs Supabase is a fixture that does not run in CI, and a
 * recorded transcript would put user content in source control for no gain: the
 * engine never sees prose, only facts.
 */

import type { Brief, BriefFact } from "./brief-store";

export type FixtureFact = readonly [string, string | number | boolean | string[]];

export type ReplayFixture = {
  /** Stable id. Appears in replay output, so renaming loses the history. */
  id: string;
  /** One line on who this person is, in their own terms. */
  describe: string;
  facts: readonly FixtureFact[];
  /**
   * What the engine MUST decide. Only the fields this case is about are
   * asserted; a fixture that pins every field turns every rule change into a
   * hundred-line diff and stops being read.
   */
  expect: {
    talentProfile?: boolean;
    workspace?: boolean;
    workspaceType?: "talent" | "business" | null;
    workspacePlan?: string | null;
    talentPlan?: string | null;
    sell?: "workspace" | "talent" | null;
    seatsNeeded?: number;
    /** Reason codes that must appear. The explanation is part of the contract. */
    reasonCodes?: readonly string[];
    unresolvedKind?: "insufficient_evidence" | "unclassifiable" | null;
    /** Trigger keys that must be proposed. A free plan has to leave a hook. */
    upgradeTriggerKeys?: readonly string[];
  };
  /** Why this case is in the corpus. Read when a replay diff shows up. */
  why: string;
};

export const REPLAY_FIXTURES: readonly ReplayFixture[] = [
  // ── The four worked cases from the plan ────────────────────────────────────
  {
    id: "nails-from-home",
    describe: "Does nails at home, alone, no business name, wants to be found.",
    facts: [
      ["person.name", "Ana"],
      ["work.discipline", "nail artist"],
      ["work.performs_service_personally", true],
      ["work.booked_by_name", true],
      ["business.works_from", "home"],
      ["business.works_alone", true],
      ["business.has_staff", false],
      ["business.represents_others", false],
    ],
    expect: {
      talentProfile: true,
      workspace: false,
      workspaceType: null,
      sell: null,
      seatsNeeded: 0,
      unresolvedKind: null,
    },
    why: "The plan's canonical no-workspace case. Selling this person a workspace is the exact failure the whole engine exists to prevent: she has no brand to run, and a workspace she cannot fill is a subscription she cancels.",
  },
  {
    id: "salon-owner-commission",
    describe: "Owns a salon, four nail artists, takes a cut of each booking.",
    facts: [
      ["person.name", "Sofia"],
      ["work.discipline", "nail artist"],
      ["business.exists", true],
      ["business.name", "Glow Studio"],
      ["business.works_from", "own_premises"],
      ["business.has_staff", true],
      ["business.staff_count", 5],
      ["business.represents_others", true],
      ["business.takes_commission", true],
      ["business.other_workers_arrangement", "commission_split"],
      ["business.clients_choose_provider", true],
    ],
    expect: {
      workspace: true,
      // Clients pick WHO they see, so the roster is the product. A business-shaped
      // workspace would hide the very thing she sells.
      workspaceType: "talent",
      sell: "workspace",
      seatsNeeded: 5,
      unresolvedKind: null,
    },
    why: "The plan's canonical roster case. Commission plus clients-choose-provider is what an agency IS. Getting the shape wrong here hides the roster and she churns before finding the setting.",
  },
  {
    id: "chair-renter",
    describe: "Rents chairs to three independent stylists; they keep their own money.",
    facts: [
      ["business.exists", true],
      ["business.name", "Corner Studio"],
      ["business.works_from", "own_premises"],
      ["business.has_staff", true],
      ["business.staff_count", 4],
      ["business.represents_others", true],
      ["business.takes_commission", false],
      ["business.other_workers_arrangement", "rent_chair"],
      ["business.clients_choose_provider", true],
    ],
    expect: {
      workspace: true,
      workspaceType: "talent",
      seatsNeeded: 4,
    },
    why: "Rent, not commission. Still a roster of named people clients choose between, so still roster-shaped — the arrangement changes the money, not the shape. This case is why arrangement and shape are separate facts.",
  },
  {
    id: "spa-salaried-staff",
    describe: "Owns a spa; therapists are on a wage and clients book a time, not a person.",
    facts: [
      ["business.exists", true],
      ["business.name", "Casa Serena"],
      ["business.works_from", "own_premises"],
      ["business.has_staff", true],
      ["business.staff_count", 6],
      ["business.other_workers_arrangement", "salary"],
      ["business.clients_choose_provider", false],
      ["goals.wants_website", true],
    ],
    expect: {
      workspace: true,
      // Business-shaped: the staff are a resource, not a roster of names.
      workspaceType: "business",
      // The bug this fixture was written for. Salaried staff are NOT roster
      // seats, so six of them must not disqualify the seat-capped Website tier.
      seatsNeeded: 0,
      unresolvedKind: null,
    },
    why: "Regression. Counting salaried staff as roster seats pushed this case off Website onto a plan she does not need, purely because the headcount was six. Seats and headcount are different numbers.",
  },

  // ── Edges that have been got wrong ────────────────────────────────────────
  {
    id: "hybrid-owner-who-performs",
    describe: "Owns a studio with two other artists AND is booked by name herself.",
    facts: [
      ["person.name", "Valentina"],
      ["work.performs_service_personally", true],
      ["work.booked_by_name", true],
      ["business.exists", true],
      ["business.name", "Estudio V"],
      ["business.works_from", "own_premises"],
      ["business.has_staff", true],
      ["business.staff_count", 3],
      ["business.represents_others", true],
      ["business.takes_commission", true],
      ["business.clients_choose_provider", true],
      ["goals.wants_website", true],
      ["presence.owns_domain", true],
    ],
    expect: {
      talentProfile: true,
      workspace: true,
      // Both are real needs; only ONE is charged for at signup. The displaced
      // side must leave a trigger behind rather than silently vanishing.
      sell: "workspace",
      talentPlan: "talent_basic",
      reasonCodes: ["other_side_stays_free"],
      upgradeTriggerKeys: ["personal_presence_wanted"],
    },
    why: "Regression. The hybrid is the most common real shape and the easiest to overcharge. Detecting both needs is required; billing both at signup is not, and the suppressed side has to be recoverable later.",
  },
  {
    id: "spa-employee-side-work",
    describe: "Works at someone else's spa, takes a little private work, no brand.",
    facts: [
      ["person.name", "Lucia"],
      ["work.discipline", "massage therapist"],
      ["work.performs_service_personally", true],
      ["work.booked_by_name", true],
      ["business.works_from", "someone_elses_premises"],
      ["business.employed_by_other", true],
      ["business.has_staff", false],
      ["business.represents_others", false],
      ["presence.has_logo", false],
    ],
    expect: {
      talentProfile: true,
      workspace: false,
      sell: null,
    },
    why: "The plan's second massage therapist, and the one an eager engine oversells. Side work is not a business: no logo, no separate accounts, nobody under her. Employment somewhere else must not read as 'has a workplace, therefore needs a workspace'.",
  },
  {
    id: "opening-turn-only",
    describe: "Said hello and nothing else yet.",
    facts: [["person.name", "Someone"]],
    expect: {
      // Mid-conversation is the NORMAL state, and it must be reported as
      // insufficient evidence rather than defaulting to a sale.
      unresolvedKind: "insufficient_evidence",
      sell: null,
    },
    why: "Guards the default. An engine that decides from one fact will decide wrongly for everyone who abandons early, and 'I do not know yet' has to be a first-class answer.",
  },
  {
    id: "solo-with-brand-and-site",
    describe: "Solo photographer, real brand, own domain, wants a proper site.",
    facts: [
      ["person.name", "Mateo"],
      ["work.discipline", "photographer"],
      ["work.booked_by_name", true],
      ["business.exists", true],
      ["business.name", "Mateo Ruiz Studio"],
      ["business.works_alone", true],
      ["business.has_staff", false],
      ["business.represents_others", false],
      ["presence.owns_domain", true],
      ["presence.has_logo", true],
      ["presence.business_social_separate", true],
      ["goals.wants_website", true],
    ],
    expect: {
      talentProfile: true,
      seatsNeeded: 0,
    },
    why: "Solo but genuinely branded. Tests that 'nobody under you' does not force the free floor when there is a real brand and a stated site goal — the opposite failure to the nails-at-home case, and just as expensive.",
  },
];

/** Build a Brief from fixture literals, so the engine sees exactly one shape. */
export function briefFromFixture(fixture: ReplayFixture): Brief {
  const facts: BriefFact[] = fixture.facts.map(([factKey, value]) => ({
    factKey,
    value,
    // Fixtures assert ENGINE behaviour, not provenance behaviour. Stating every
    // fact keeps the corpus reading the rules under test rather than the
    // confidence ladder, which brief-store.test.ts already covers.
    source: "user_stated",
    status: "confirmed",
    confidence: 1,
    sourceExcerpt: null,
    sourceUrl: null,
    questionId: null,
    questionVersion: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

  return {
    id: `fixture-${fixture.id}`,
    facts,
    status: "discovering",
    locale: "en",
    currentVersion: 1,
    engineVersion: null,
    profileId: null,
    guestSessionId: null,
    signupLeadId: null,
    talentProfileId: null,
    tenantId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
