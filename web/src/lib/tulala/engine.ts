/**
 * engine.ts — the Tulala Recommendation Engine.
 *
 * PURE, DETERMINISTIC, NO LLM. That is not a style preference; three properties
 * the product needs depend on it:
 *
 *   1. Replay. Because the engine is a function of (facts, catalog, version),
 *      every past intake can be re-run against a new ruleset and the diff read
 *      off. A model in this path would make "would this user be classified
 *      differently now" unanswerable.
 *   2. Explainability. Every output carries the facts that produced it, so the
 *      recommendation screen can say "because you told me X" and be telling the
 *      truth rather than generating a plausible reason.
 *   3. Defensibility. The engine decides what someone is charged. A rule you can
 *      point at is a rule you can defend to the person paying.
 *
 * The LLM's job is downstream: take the resolved recommendation and put it in
 * the user's own words. It never computes it, and per `redactForPrompt` it never
 * sees a price.
 *
 * WEIGHTED EVIDENCE, NOT BOOLEANS
 * ───────────────────────────────
 * "Does she need a workspace" is not one question with one answer. It is a pile
 * of partial signals, some of which argue the other way, and a boolean cascade
 * over them produces exactly the failure the intake exists to avoid: a
 * home-working sole trader sold Studio because she happened to have a logo.
 *
 * So each fact declares its own weight in `fact-keys.ts`, signed, in four bands
 * (weak 1, moderate 2, strong 3, decisive 5), and the engine sums them. Weights
 * live with the facts rather than here so an industry pack ships its own
 * evidence and a reviewer can read the whole classifier's input in one file.
 *
 * DECISIVE FACTS
 * ──────────────
 * A few facts settle the workspace question by themselves, whatever else is
 * present. Someone who takes a percentage of another person's booking is
 * running a business; no amount of "but I work from home" changes that. Modelled
 * as a flag rather than as a very large weight, because a large weight is still
 * outvoteable by enough negatives and this must not be.
 */

import { PLAN_CATALOG, type PlanKey } from "@/lib/access/plan-catalog";
import type { WorkspaceType } from "@/lib/saas/workspace-type";
import { planOption, type TulalaEntitlements } from "./entitlements";
import { factKeyDef } from "./fact-keys";
import {
  booleanFact,
  listFact,
  numberFact,
  scorableFacts,
  stringFact,
  type Brief,
  type BriefFact,
} from "./brief-store";
import type {
  PlanDecision,
  Reason,
  Recommendation,
  StructureDecision,
  Unresolved,
  UpgradeTriggerProposal,
} from "./engine-types";
import {
  chooseTalentPlan,
  chooseWhatToSell,
  chooseWorkspacePlan,
  isPaid,
  proposeUpgradeTriggers,
  takesCommissionFromRoster,
} from "./engine-plans";

// The plan half of the engine, re-exported so `engine.ts` remains the single
// import site for consumers and the split stays an internal detail.
export {
  chooseTalentPlan,
  chooseWhatToSell,
  chooseWorkspacePlan,
  proposeUpgradeTriggers,
  takesCommissionFromRoster,
};

// ─── Version ──────────────────────────────────────────────────────────────────

/**
 * Stamped on every recommendation and stored on the brief.
 *
 * Bump on ANY change to a threshold, a weight reading, or a decision rule. This
 * one string is what lets the replay harness tell "the rules changed" from "the
 * user said something different", and a rule change shipped without a bump
 * silently corrupts every comparison made afterwards.
 */
export const ENGINE_VERSION = "tulala-engine-1";

// ─── Tuning ───────────────────────────────────────────────────────────────────

/**
 * Evidence score at which an axis is considered fully established.
 *
 * 8 = one decisive fact plus one strong one, or three strong ones. Chosen so
 * that a single strong signal lands mid-confidence rather than certain: one
 * logo is not a business, and the intake should keep asking.
 */
const SATURATION = 8;

/**
 * Talent evidence needed to propose a Talent Profile.
 *
 * Deliberately low. A Talent Profile is free, reversible, and a draft until
 * published, so the cost of proposing one wrongly is a screen the user says no
 * to. The cost of NOT proposing one is a person who came to sell their own work
 * and was handed a business dashboard.
 */
const TALENT_THRESHOLD = 0.3;

/**
 * Workspace evidence needed to propose a Workspace.
 *
 * Higher than talent, and asymmetric on purpose: a workspace is the thing that
 * costs money and the thing that "fit, not force" is about. Below this the
 * engine records an upgrade trigger instead of pitching.
 */
const WORKSPACE_THRESHOLD = 0.5;

/**
 * Assumed head count when someone says other people work with them but not how
 * many.
 *
 * 2 = them plus one. The floor that makes the roster real without inventing a
 * plan tier: 2 still fits Free's 5 seats, so this assumption can never by
 * itself cause a paid recommendation. Anything larger could.
 */
const UNKNOWN_HEADCOUNT = 2;

// ─── Output shape ─────────────────────────────────────────────────────────────

// Re-exported so `engine.ts` stays the single import site for consumers. The
// declarations live in engine-types.ts only so the two halves of the engine can
// both name them without importing each other.
export type {
  Reason,
  StructureDecision,
  PlanDecision,
  UpgradeTriggerProposal,
  Unresolved,
  Recommendation,
} from "./engine-types";


// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceSummary = {
  talentScore: number;
  workspaceScore: number;
  /** Facts whose `decisive` flag fired, i.e. settled the workspace question. */
  decisiveFactKeys: string[];
  /** Facts that argued AGAINST a workspace. Surfaced so a "no" is explainable. */
  negativeFactKeys: string[];
  contributing: { talent: string[]; workspace: string[] };
};

/**
 * Sum the declared weights of the facts present.
 *
 * Each weight is multiplied by the fact's own confidence, so a 0.5-confidence
 * inference contributes half of what the same statement from the user would. A
 * guess and a statement scoring identically is how an unapproved inference ends
 * up deciding what someone pays.
 *
 * A `decisive` fact only fires when its value is TRUE. "Do other people work
 * with you? No" is a real and common answer, and treating the presence of the
 * question as the signal would classify every sole trader as a business.
 */
export function summarizeEvidence(facts: BriefFact[]): EvidenceSummary {
  let talentScore = 0;
  let workspaceScore = 0;
  const decisiveFactKeys: string[] = [];
  const negativeFactKeys: string[] = [];
  const contributing = { talent: [] as string[], workspace: [] as string[] };

  for (const fact of facts) {
    const def = factKeyDef(fact.factKey);
    const evidence = def?.evidence;
    if (!evidence) continue;

    // A boolean fact whose value is false asserts the ABSENCE of the thing the
    // weight describes, so its positive weight must not be counted. Its
    // negative weight must not be counted either: "I do not work alone" is not
    // evidence for a workspace, it is the removal of evidence against one.
    if (typeof fact.value === "boolean" && fact.value === false) continue;

    const weight = Math.max(0, Math.min(1, fact.confidence));

    if (typeof evidence.talent === "number" && evidence.talent !== 0) {
      talentScore += evidence.talent * weight;
      contributing.talent.push(fact.factKey);
    }
    if (typeof evidence.workspace === "number" && evidence.workspace !== 0) {
      workspaceScore += evidence.workspace * weight;
      contributing.workspace.push(fact.factKey);
      if (evidence.workspace < 0) negativeFactKeys.push(fact.factKey);
    }
    if (evidence.decisive && fact.value === true) {
      decisiveFactKeys.push(fact.factKey);
    }
  }

  return {
    talentScore,
    workspaceScore,
    decisiveFactKeys,
    negativeFactKeys,
    contributing,
  };
}

function normalize(score: number): number {
  if (score <= 0) return 0;
  return Math.min(1, score / SATURATION);
}

// ─── The four operating questions ─────────────────────────────────────────────

/**
 * How many people this operation involves, whatever they turn out to be.
 *
 * Deliberately shape-blind: this is a head count, not a seat count. Read from
 * the stated total when there is one, otherwise floored at "them plus one" when
 * they said someone else is involved, otherwise zero.
 */
export function resolveHeadcount(brief: Brief): number {
  const stated = numberFact(brief, "business.staff_count");
  if (stated !== null && stated > 0) return Math.round(stated);

  const representsOthers = booleanFact(brief, "business.represents_others");
  const hasStaff = booleanFact(brief, "business.has_staff");
  if (representsOthers === true || hasStaff === true) return UNKNOWN_HEADCOUNT;

  return 0;
}

/**
 * How many ROSTER SEATS the operation needs, which is not the same as how many
 * people work there.
 *
 * The distinction is real in the schema, not a nicety. On a business-shaped
 * workspace the staff are `talent_profiles.profile_kind = 'resource'` rows:
 * `user_id` is NULL, they are hidden from every public surface, and they do NOT
 * consume roster seats. A spa with six salaried therapists whom clients cannot
 * choose between needs zero roster seats and the appointments + staff-resources
 * engine instead.
 *
 * Getting this wrong in either direction is expensive. Counting a salaried spa's
 * staff as roster seats pushes it off Website onto a plan it does not need;
 * NOT counting a salon's commission-split artists sells a plan that cannot hold
 * them.
 */
export function resolveSeatsNeeded(brief: Brief, shape: WorkspaceType): number {
  if (shape === "business") return 0;
  return resolveHeadcount(brief);
}

/**
 * Roster-shaped or staff-resource-shaped.
 *
 * The fourth operating question, and nothing in the product asks it today. It
 * decides whether the roster surfaces exist at all:
 *
 *   Clients book a NAMED person who splits the money  → talent-shaped
 *   Clients book a TIME and staff are interchangeable  → business-shaped
 *
 * Defaults to talent-shaped, matching `DEFAULT_WORKSPACE_TYPE`, because that is
 * the recoverable direction: a talent-shaped workspace shows a roster the owner
 * can ignore, while a business-shaped one hides one she may be looking for.
 */
export function resolveWorkspaceType(brief: Brief): WorkspaceType {
  const clientsChoose = booleanFact(brief, "business.clients_choose_provider");
  if (clientsChoose === true) return "talent";
  if (clientsChoose === false) return "business";

  // No direct answer. The money arrangement implies it: a split means the
  // person is the product, a salary means the slot is.
  const arrangement = stringFact(brief, "business.other_workers_arrangement");
  if (arrangement === "commission_split" || arrangement === "rent_chair") return "talent";
  if (arrangement === "salary") return "business";

  if (booleanFact(brief, "business.represents_others") === true) return "talent";
  return "talent";
}


// ─── The engine ───────────────────────────────────────────────────────────────

/**
 * Facts whose absence most often leaves the workspace question open. Reported as
 * `missingFactKeys` so the Agent knows what to ask next rather than guessing.
 */
const DECIDING_FACT_KEYS: readonly string[] = [
  "business.exists",
  "business.works_from",
  "business.represents_others",
  "business.has_staff",
  "business.other_workers_arrangement",
  "business.clients_choose_provider",
];

export function recommend(
  brief: Brief,
  ents: TulalaEntitlements,
): Recommendation {
  const facts = scorableFacts(brief);
  const evidence = summarizeEvidence(facts);

  const talentConfidence = normalize(evidence.talentScore);
  // A decisive fact settles the axis outright. Not "adds a lot": a large weight
  // is still outvoteable by enough negatives, and this must not be.
  const workspaceConfidence =
    evidence.decisiveFactKeys.length > 0 ? 1 : normalize(evidence.workspaceScore);

  const wantsTalent = talentConfidence >= TALENT_THRESHOLD;
  const wantsWorkspace = workspaceConfidence >= WORKSPACE_THRESHOLD;

  // Shape first, then seats. The order is load-bearing: on a business-shaped
  // workspace the staff are resource rows that consume no roster seats, so
  // asking "how many seats" before "what shape" gets a spa the wrong plan.
  const workspaceType = wantsWorkspace ? resolveWorkspaceType(brief) : null;
  const seatsNeeded = workspaceType ? resolveSeatsNeeded(brief, workspaceType) : 0;

  const structure: StructureDecision = {
    talentProfile: wantsTalent,
    workspace: wantsWorkspace,
    workspaceType,
  };

  const reasons: Reason[] = [];

  if (wantsTalent) {
    reasons.push({
      code: "talent_profile_fits",
      text: talentReasonText(brief),
      factKeys: evidence.contributing.talent,
    });
  }

  if (wantsWorkspace) {
    reasons.push({
      code: "workspace_fits",
      text: workspaceReasonText(brief, evidence),
      factKeys: evidence.contributing.workspace,
    });
    if (structure.workspaceType === "business") {
      reasons.push({
        code: "business_shaped_workspace",
        text: "Clients book a time with you rather than a specific person, so the workspace is set up around your staff and your calendar instead of a public roster.",
        factKeys: ["business.clients_choose_provider", "business.other_workers_arrangement"],
      });
    }
  } else if (evidence.negativeFactKeys.length > 0) {
    reasons.push({
      code: "no_workspace_needed",
      text: "You are not running a separate operation, so there is nothing here that needs a business workspace.",
      factKeys: evidence.negativeFactKeys,
    });
  }

  const workspacePlanChoice = wantsWorkspace
    ? chooseWorkspacePlan(brief, ents, seatsNeeded)
    : null;
  const talentPlanChoice = wantsTalent ? chooseTalentPlan(brief, ents) : null;

  if (workspacePlanChoice) reasons.push(...workspacePlanChoice.reasons);
  if (talentPlanChoice) reasons.push(...talentPlanChoice.reasons);

  const plans: PlanDecision = {
    workspace: workspacePlanChoice?.plan ?? null,
    talent: talentPlanChoice?.plan ?? null,
    sell: null,
  };
  plans.sell = chooseWhatToSell(ents, plans);

  const upgradeTriggers = proposeUpgradeTriggers(brief, { structure, plans });

  // Selling one side means the OTHER side is explicitly free, not absent. The
  // displaced need becomes a trigger rather than vanishing: she did say she
  // wanted a personal site, and the product should raise it when the workspace
  // site turns out not to be the same thing.
  if (plans.sell === "workspace" && plans.talent && isPaid(ents, plans.talent)) {
    const displaced = plans.talent;
    plans.talent = "talent_basic";
    reasons.push({
      code: "other_side_stays_free",
      text: "Your personal profile stays on the free tier. One thing to pay for, not two.",
      factKeys: [],
    });
    upgradeTriggers.push({
      triggerKey: "personal_presence_wanted",
      targetPackage: "talent",
      targetTier: displaced,
      rationale:
        "You wanted a site under your own name as well as the business one. Worth revisiting once the business site is live and you can see whether it covers you.",
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    confidence: { talent: talentConfidence, workspace: workspaceConfidence },
    scores: { talent: evidence.talentScore, workspace: evidence.workspaceScore },
    structure,
    plans,
    seatsNeeded,
    reasons,
    upgradeTriggers,
    unresolved: resolveUnresolved(brief, facts, structure, plans, seatsNeeded, ents),
    catalogDegraded: ents.degraded,
  };
}

/**
 * Why the engine could not decide, or null when it could.
 *
 * The two kinds are kept apart because they have different owners.
 * `insufficient_evidence` is the conversation's problem and the Agent fixes it
 * by asking. `unclassifiable` is the product's problem: the facts are there and
 * the laws do not cover the shape, and that has to reach a person.
 */
function resolveUnresolved(
  brief: Brief,
  facts: BriefFact[],
  structure: StructureDecision,
  plans: PlanDecision,
  seatsNeeded: number,
  ents: TulalaEntitlements,
): Unresolved | null {
  if (!structure.talentProfile && !structure.workspace) {
    const missing = DECIDING_FACT_KEYS.filter(
      (key) => !facts.some((f) => f.factKey === key),
    );
    // Nothing proposed and nothing left to ask means the facts describe
    // something the laws do not cover. That is a product gap.
    if (missing.length === 0) {
      return {
        kind: "unclassifiable",
        note: "Every deciding question was answered and neither a Talent Profile nor a Workspace scored above threshold.",
      };
    }
    return { kind: "insufficient_evidence", missingFactKeys: missing };
  }

  // A roster nothing self-serve can hold. Not a conversation failure: the
  // answer is a human, and pretending Network is a self-serve pick would send
  // them to a checkout that does not exist.
  if (structure.workspace && seatsNeeded > 0) {
    const chosen = plans.workspace ? planOption(ents, plans.workspace) : null;
    const seatsOk =
      chosen && (chosen.rosterSeats === null || chosen.rosterSeats >= seatsNeeded);
    if (!seatsOk || (chosen && !chosen.isSelfServe)) {
      return {
        kind: "unclassifiable",
        note: `A roster of ${seatsNeeded} needs ${
          chosen ? PLAN_CATALOG[chosen.planKey].displayName : "a plan"
        }, which is not self-serve. Route to a human.`,
      };
    }
  }

  void brief;
  return null;
}

// ─── Reason text ──────────────────────────────────────────────────────────────

function talentReasonText(brief: Brief): string {
  if (booleanFact(brief, "work.booked_by_name") === true) {
    return "People ask for you by name, which means the person is the product. That is what a Talent Profile is.";
  }
  const discipline = stringFact(brief, "work.discipline");
  if (discipline) {
    return `You do the ${discipline} work yourself, so a profile in your own name is the thing clients should be finding.`;
  }
  return "You sell your own work, so a profile in your own name is the right home for it.";
}

function workspaceReasonText(brief: Brief, evidence: EvidenceSummary): string {
  const name = stringFact(brief, "business.name");
  if (evidence.decisiveFactKeys.includes("business.takes_commission")) {
    return name
      ? `${name} keeps a share of what the people working through it earn. That is an operation, and it needs its own workspace.`
      : "You keep a share of what the people working through you earn. That is an operation, and it needs its own workspace.";
  }
  if (
    evidence.decisiveFactKeys.includes("business.represents_others") ||
    evidence.decisiveFactKeys.includes("business.has_staff")
  ) {
    return name
      ? `Other people work under ${name}, so it needs a workspace of its own rather than living inside your personal profile.`
      : "Other people work with you, so the operation needs a workspace of its own rather than living inside your personal profile.";
  }
  if (name) {
    return `${name} is a name that is not yours, which means there is a brand to run and not only a person to show.`;
  }
  return "You described a brand to run, separate from your own name, which is what a workspace is for.";
}

// ─── Convenience for the UI ───────────────────────────────────────────────────

/** The services list, for the approval screen. Read here so the UI stays dumb. */
export function servicesForReview(brief: Brief): string[] {
  return listFact(brief, "work.services");
}
