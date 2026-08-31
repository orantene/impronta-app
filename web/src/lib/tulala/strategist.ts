/**
 * strategist.ts — post-signup Account Strategist, pure half.
 *
 * The intake Agent's job ends at approval. This module is what continues: the
 * same Brief, read against the account the person now has, so "I'm hiring two
 * people" is not a new intake, it is a condition the engine already wrote down.
 *
 * WHY IT IS PURE
 * ──────────────
 * The upgrade triggers were designed to be machine-checkable against Brief
 * facts. Evaluating them here, with no I/O, means a rule change can be replayed
 * against every past Brief the same way the Recommendation Engine can. Putting
 * the LLM in this path would destroy that property on day one.
 *
 * WHAT IT DOES NOT DO
 * ───────────────────
 * It does not provision, charge, deactivate a profile, or rewrite a site. Those
 * are irreversible enough that decision L20 applies harder post-signup than
 * before it. This module returns DRAFTS: a raised upgrade the person can accept
 * or dismiss, and Brief updates that still need their confirmation when they
 * came from inference rather than testimony.
 */

import { booleanFact, numberFact, stringFact, type Brief } from "./brief-store";

/** Mirror of the server row shape, kept here so this module stays free of I/O. */
export type PendingUpgradeTrigger = {
  id: string;
  triggerKey: string;
  targetPackage: string;
  targetTier: string;
  rationale: string | null;
};

export type FiredTrigger = {
  trigger: PendingUpgradeTrigger;
  /** The fact keys that made the condition true, for the explanation. */
  evidenceKeys: string[];
};

export type StrategistProposal =
  | {
      kind: "raise_upgrade";
      trigger: PendingUpgradeTrigger;
      evidenceKeys: string[];
    }
  | {
      kind: "note";
      /** Plain language for the reply; never a command. */
      text: string;
      factKeys: string[];
    };

/**
 * Which pending triggers are now true of the Brief.
 *
 * Every key in `proposeUpgradeTriggers` must have a matcher here. A trigger with
 * no matcher is a drip campaign in disguise: it can never fire from a condition,
 * so the only way it surfaces is by being asked, which is the behaviour the
 * triggers were invented to replace.
 */
export function evaluatePendingTriggers(
  brief: Brief,
  pending: PendingUpgradeTrigger[],
): FiredTrigger[] {
  const fired: FiredTrigger[] = [];
  for (const trigger of pending) {
    const evidence = matchTrigger(brief, trigger.triggerKey);
    if (evidence) fired.push({ trigger, evidenceKeys: evidence });
  }
  return fired;
}

function matchTrigger(brief: Brief, key: string): string[] | null {
  switch (key) {
    case "roster_seat_needed":
      // Someone else is taking bookings through them, and money moves. Either
      // half alone is not enough: salaried staff is Website-shaped, not Studio.
      if (
        booleanFact(brief, "business.has_staff") === true &&
        booleanFact(brief, "business.takes_commission") === true
      ) {
        return ["business.has_staff", "business.takes_commission"];
      }
      if (
        booleanFact(brief, "business.represents_others") === true &&
        (numberFact(brief, "business.staff_count") ?? 0) >= 1
      ) {
        return ["business.represents_others", "business.staff_count"];
      }
      return null;

    case "stated_hiring_intent":
      // Intent alone was recorded at signup. It only fires when headcount
      // actually moves off "just me".
      if (
        booleanFact(brief, "business.has_staff") === true ||
        (numberFact(brief, "business.staff_count") ?? 0) >= 1
      ) {
        return ["business.has_staff", "business.staff_count"];
      }
      return null;

    case "own_domain_wanted":
      if (
        stringFact(brief, "presence.website_url") !== null ||
        booleanFact(brief, "presence.owns_domain") === true
      ) {
        return ["presence.website_url", "presence.owns_domain"];
      }
      return null;

    case "second_workspace_shape_needed":
      // Both a roster and salaried staff now exist — the hybrid that signup
      // correctly refused to double-provision.
      if (
        booleanFact(brief, "business.represents_others") === true &&
        booleanFact(brief, "business.has_staff") === true
      ) {
        return ["business.represents_others", "business.has_staff"];
      }
      return null;

    default:
      // Unknown key: do not fire. Inventing a match for a key this module does
      // not understand would raise an offer the engine never intended.
      return null;
  }
}

/**
 * Soft observations for the reply, separate from hard trigger fires.
 *
 * These never charge anyone and never change a plan. They exist so the
 * Strategist has something true to say when the Brief moved but no upgrade
 * condition crossed — "Cancun is noted" is still useful, and silence after a
 * real update would read as the Agent having stopped listening.
 */
export function strategistNotes(
  brief: Brief,
  justLearnedKeys: string[],
): StrategistProposal[] {
  const notes: StrategistProposal[] = [];
  const learned = new Set(justLearnedKeys);

  if (learned.has("person.city") || learned.has("person.country")) {
    const city = stringFact(brief, "person.city");
    notes.push({
      kind: "note",
      text: city
        ? `Noted: your geography now includes ${city}. That feeds where you show up and how booking is framed, once you approve the change.`
        : "Noted the geography change. It will feed where you show up once you approve it.",
      factKeys: ["person.city", "person.country"].filter((k) => learned.has(k)),
    });
  }

  if (
    learned.has("business.has_staff") ||
    learned.has("business.staff_count") ||
    learned.has("goals.wants_to_grow_team")
  ) {
    const count = numberFact(brief, "business.staff_count");
    notes.push({
      kind: "note",
      text:
        count && count > 0
          ? `You now have ${count} people in the picture. I will only raise a paid plan if the way you work together actually needs one.`
          : "Team changes noted. I will only raise a paid plan if the way you work together actually needs one.",
      factKeys: ["business.has_staff", "business.staff_count", "goals.wants_to_grow_team"].filter(
        (k) => learned.has(k),
      ),
    });
  }

  if (learned.has("goals.focus_on_business") || learned.has("goals.talent_still_active")) {
    notes.push({
      kind: "note",
      text: "If you only run the business now, we can keep the Workspace and leave the Talent Profile quiet, without deleting anything. Say the word and I will draft that change for you to approve.",
      factKeys: ["goals.focus_on_business", "goals.talent_still_active"].filter((k) =>
        learned.has(k),
      ),
    });
  }

  return notes;
}

export function proposalsFromEvaluation(
  fired: FiredTrigger[],
  notes: StrategistProposal[],
): StrategistProposal[] {
  return [
    ...fired.map(
      (f): StrategistProposal => ({
        kind: "raise_upgrade",
        trigger: f.trigger,
        evidenceKeys: f.evidenceKeys,
      }),
    ),
    ...notes,
  ];
}
