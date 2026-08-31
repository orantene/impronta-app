/**
 * laws-bridge.ts — Brief facts to a law-checkable proposal.
 *
 * `laws.ts` states the product's rules against a `StructureProposal`, which is a
 * deliberately narrow vocabulary: "is the subject a person", "does a distinct
 * operating identity exist". The Brief speaks a much wider one. This module is
 * the translation, and it is its own file because the translation is where the
 * judgement lives and it deserves to be read and tested on its own.
 *
 * ONE RULE GOVERNS EVERYTHING HERE: NEVER GUESS IN THE PERMISSIVE DIRECTION.
 * ────────────────────────────────────────────────────────────────────────────
 * Every field that gates a law defaults to the value that makes the law FIRE,
 * not the value that satisfies it. An unknown becomes `null` or `false`, never
 * `true`.
 *
 * The reason is asymmetric cost. A law that fires wrongly produces one more
 * question in a conversation, which is cheap and self-correcting. A law that
 * fails to fire produces a Talent Profile for a limited company, or a published
 * profile with no real photograph of the person on it, and those are the exact
 * outcomes L1 through L5 exist to prevent. So silence is treated as "not
 * established", which is what it actually is.
 */

import { booleanFact, factValue, listFact, type Brief } from "./brief-store";
import type { StructureProposal } from "./laws";

/** What the visitor asked for, from the approval screen. */
export type ProposedStructure = {
  talentProfile: boolean;
  workspace: boolean;
  workspaceType: "talent" | "business" | null;
};

/**
 * Facts the intake cannot know, supplied by the caller.
 *
 * Photo count is the honest example. Nothing in a conversation can establish
 * that a real photograph of this person exists — that is an upload, and uploads
 * happen after signup. So the intake passes 0 and L4/L5 are evaluated with
 * `publishTalentProfileNow: false`, which is TRUE: signup creates a draft.
 * The photo law then bites at the publish gate, where the evidence exists.
 */
export type ExternalFacts = {
  authenticPersonPhotoCount?: number;
  publishTalentProfileNow?: boolean;
};

export function proposalFromBrief(
  brief: Brief,
  chosen: ProposedStructure,
  external: ExternalFacts = {},
): StructureProposal {
  return {
    createTalentProfile: chosen.talentProfile,
    createWorkspace: chosen.workspace,

    talentSubjectIsIndividual: subjectIsIndividual(brief),
    talentDisplayName: talentDisplayName(brief),
    talentNameIsBrandMark: nameIsBrandMark(brief),

    // Both default to the safe side: no photos proven, and nothing published.
    // Signup produces a draft (decision L20), so `false` is not a hedge here,
    // it is the accurate description of what approval creates.
    authenticPersonPhotoCount: external.authenticPersonPhotoCount ?? 0,
    publishTalentProfileNow: external.publishTalentProfileNow ?? false,

    // The intake never renders a face. If it ever does, this becomes a real
    // read and L3 starts protecting people again — hard-coding `true` here
    // would silently disable it.
    synthesizePortrait: false,

    hasDistinctOperatingIdentity: hasDistinctOperatingIdentity(brief),
  };
}

/**
 * Is the subject of the proposed profile a human being?
 *
 * Returns null, not false, when nothing establishes it. L1 treats null as a
 * blocker, which is the point: "we never asked" and "we asked and it is a
 * company" are both reasons not to create a Talent Profile, and collapsing them
 * to `false` would lose the distinction the remedy text depends on.
 *
 * A personal name is the strongest signal available in an intake. Someone who
 * gives a first-and-last name and says they do the work themselves is a person;
 * no company has ever answered "what is your name" with "Ana Ruiz".
 */
export function subjectIsIndividual(brief: Brief): boolean | null {
  const performsPersonally = booleanFact(brief, "work.performs_service_personally");
  const bookedByName = booleanFact(brief, "work.booked_by_name");
  const hasPersonalName = Boolean(stringFact(brief, "person.name"));

  if (performsPersonally === true && hasPersonalName) return true;
  if (bookedByName === true && hasPersonalName) return true;

  // Explicitly told the work is not done by them: this is an operation, and the
  // profile would be a brand pretending to be a person.
  if (performsPersonally === false) return false;

  return null;
}

/**
 * The name the profile would carry.
 *
 * Professional name wins over legal name when both exist — a stage name is what
 * clients search for, and L2 only asks that the profile carry A name belonging
 * to the person, not their passport name.
 */
export function talentDisplayName(brief: Brief): string | null {
  return stringFact(brief, "person.professional_name") ?? stringFact(brief, "person.name");
}

/**
 * Is the name offered for the profile a brand mark rather than a person's name?
 *
 * True when it matches the business name and is NOT also the person's own name.
 * "Glow Studio" in a Talent display slot is this case, and it is how a directory
 * of people quietly becomes a directory of logos.
 *
 * The second half of that test is what keeps the rule honest, and it is not an
 * edge case: a freelancer trading under her own name has a business called "Ana
 * Ruiz" and a personal name of "Ana Ruiz", and "Ana Ruiz" is obviously not a
 * brand mark. Testing only for a business-name match would reject the single
 * most common shape of solo professional on the platform.
 */
export function nameIsBrandMark(brief: Brief): boolean {
  const display = talentDisplayName(brief);
  if (!display) return false;

  const businessName = stringFact(brief, "business.name");
  if (!businessName || !sameName(display, businessName)) return false;

  const personal = stringFact(brief, "person.name");
  return !(personal && sameName(display, personal));
}

/**
 * Does a separate operating identity exist, distinct from the person?
 *
 * This is the L6 test, and the whole "massage therapist who also has a logo"
 * question the product model turns on. Doing paid work on the side is NOT this.
 * A brand, a domain, staff, a separate booking channel, or money taken from
 * other people's work IS.
 *
 * Any single one of these is sufficient. They are not scored, because L6 is a
 * gate rather than a judgement: the question is whether a second thing exists,
 * and one logo is enough to prove one logo exists.
 */
export function hasDistinctOperatingIdentity(brief: Brief): boolean {
  if (booleanFact(brief, "business.exists") === true) return true;
  if (booleanFact(brief, "business.has_staff") === true) return true;
  if (booleanFact(brief, "business.represents_others") === true) return true;
  if (booleanFact(brief, "business.takes_commission") === true) return true;
  if (booleanFact(brief, "presence.has_logo") === true) return true;
  if (booleanFact(brief, "presence.owns_domain") === true) return true;
  if (booleanFact(brief, "presence.business_social_separate") === true) return true;
  if (booleanFact(brief, "operations.business_receives_bookings") === true) return true;

  // A business NAME that is not simply the person's own name is an identity by
  // itself: someone who called their work "Glow Studio" has already decided it
  // is a thing separate from them.
  const businessName = stringFact(brief, "business.name");
  const personalName = stringFact(brief, "person.name");
  if (businessName && (!personalName || !sameName(businessName, personalName))) return true;

  if (stringFact(brief, "presence.website_url")) return true;

  // Owning premises is an operation whatever else is true. Working from home,
  // or from someone else's place, is not.
  if (factValue(brief, "business.works_from") === "own_premises") return true;

  // Several named services under one roof reads as an offering rather than a
  // personal practice. Three is the threshold because two is a specialist with
  // a variant, and the point of the test is a menu.
  if (listFact(brief, "work.services").length >= 3 && businessName) return true;

  return false;
}

/**
 * Loose name comparison: case, accents, punctuation and spacing all ignored.
 *
 * "Ana Ruíz" and "ana ruiz" are the same person, and someone typing their own
 * name twice in one conversation will not type it identically twice.
 */
function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stringFact(brief: Brief, key: string): string | null {
  const value = factValue(brief, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
