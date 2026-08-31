/**
 * engine-plans.ts — given a shape, which plan.
 *
 * Split from `engine.ts` at the seam between the two questions the engine
 * actually answers. `engine.ts` decides WHAT SHAPE someone is (talent, workspace,
 * both, and which kind of workspace) from weighted evidence. This file decides
 * WHAT THEY PAY given that shape, reading the live catalog.
 *
 * The split is worth having beyond the line count: the shape rules change when
 * the product model changes, and the plan rules change when pricing or seat caps
 * change. Those are different pressures on different schedules, and mixing them
 * meant every pricing tweak sat in the same file as the classifier.
 *
 * Still pure. Everything here is a function of (facts, catalog), so the replay
 * harness covers it exactly as it covers the rest.
 */

import { PLAN_CATALOG, type PlanKey } from "@/lib/access/plan-catalog";
import type { WorkspaceType } from "@/lib/saas/workspace-type";
import {
  cheapestWorkspacePlanSeating,
  planOption,
  type PlanFamily,
  type TulalaEntitlements,
  type TulalaPlanOption,
} from "./entitlements";
import { booleanFact, numberFact, stringFact, type Brief } from "./brief-store";
import type { Reason, StructureDecision, PlanDecision, UpgradeTriggerProposal } from "./engine-types";

/**
 * Does this workspace take a cut of another person's booking?
 *
 * Load-bearing for the plan floor. Free is the friend-link tier: no commission,
 * no exclusivity (`EXCLUSIVE_PLAN_TIERS` is studio / agency / network). So an
 * operation that splits money with its roster cannot run on Free, regardless of
 * how few people it seats. This is what makes a three-artist salon Studio rather
 * than Free.
 */
export function takesCommissionFromRoster(brief: Brief): boolean {
  if (booleanFact(brief, "business.takes_commission") === true) return true;
  return stringFact(brief, "business.other_workers_arrangement") === "commission_split";
}

// ─── Plan choice ──────────────────────────────────────────────────────────────

/** Plans that can hold a roster AND take a cut of it. */
const COMMISSION_CAPABLE_TIERS: readonly PlanKey[] = ["studio", "agency", "network"];

function firstSellable(
  ents: TulalaEntitlements,
  keys: readonly PlanKey[],
): TulalaPlanOption | null {
  for (const key of keys) {
    const option = planOption(ents, key);
    if (option && option.isSellableNow && option.isSelfServe) return option;
  }
  return null;
}

/**
 * The workspace plan, and why.
 *
 * Order of operations matters and is the whole rule:
 *
 *   1. A roster need at all disqualifies Website. `PLAN_SEAT_CAPS.website` is 0,
 *      so recommending it to anyone who seats another person is a functional
 *      DOWNGRADE from Free wearing an upgrade label. Absolute, regardless of
 *      price sensitivity.
 *   2. Taking a cut raises the floor to Studio, because Free cannot.
 *   3. Otherwise the cheapest plan that seats the head count wins, which lands
 *      1 to 5 people on Free, 6 to 15 on Studio, and above 15 on Agency.
 *   4. With no roster at all, Website is right only when they actually want a
 *      site of their own. Otherwise Free, and mean it.
 */
export function chooseWorkspacePlan(
  brief: Brief,
  ents: TulalaEntitlements,
  seatsNeeded: number,
): { plan: PlanKey; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const commission = takesCommissionFromRoster(brief);

  if (seatsNeeded > 0) {
    reasons.push({
      code: "roster_disqualifies_website",
      text:
        seatsNeeded === 1
          ? "Website is out, because it cannot hold a single bookable person."
          : `Website is out, because it cannot hold the ${seatsNeeded} people you work with.`,
      factKeys: ["business.staff_count", "business.represents_others"],
    });
  }

  if (commission) {
    const floor = firstSellable(ents, COMMISSION_CAPABLE_TIERS);
    // Still respect the seat cap on top of the commission floor: a 40-person
    // roster that takes a cut needs Agency, not Studio.
    const seating = cheapestWorkspacePlanSeating(ents, Math.max(seatsNeeded, 1));
    const pick =
      seating && COMMISSION_CAPABLE_TIERS.includes(seating.planKey) ? seating : floor;
    if (pick) {
      reasons.push({
        code: "commission_requires_paid_tier",
        text: `You take a share of what they earn, and that only works from ${pick.displayName} up. On Free, the roster is friend-link access with no cut.`,
        factKeys: ["business.takes_commission", "business.other_workers_arrangement"],
      });
      return { plan: pick.planKey, reasons };
    }
  }

  if (seatsNeeded > 0) {
    const seating = cheapestWorkspacePlanSeating(ents, seatsNeeded);
    if (seating) {
      reasons.push({
        code: "cheapest_plan_that_seats",
        text:
          seating.monthlyPriceCents === 0
            ? `${seating.displayName} already holds everyone you described, so there is nothing to pay yet.`
            : `${seating.displayName} is the smallest plan that holds ${seatsNeeded} people.`,
        factKeys: ["business.staff_count"],
      });
      return { plan: seating.planKey, reasons };
    }
    // Nothing in the catalog fits. Real outcome for a large roster on a catalog
    // where the top tier is unsellable; the caller surfaces it as unresolved.
    reasons.push({
      code: "no_plan_seats_this_roster",
      text: `Nothing self-serve holds ${seatsNeeded} people. Someone should talk to you directly.`,
      factKeys: ["business.staff_count"],
    });
    return { plan: "network", reasons };
  }

  const wantsSite =
    booleanFact(brief, "goals.wants_website") === true ||
    booleanFact(brief, "presence.owns_domain") === true ||
    stringFact(brief, "presence.website_url") !== null;

  if (wantsSite) {
    const website = firstSellable(ents, ["website", "studio"]);
    if (website) {
      reasons.push({
        code: "site_without_roster",
        text: `You want a site of your own and you are not booking anyone else, which is exactly what ${website.displayName} is for.`,
        factKeys: ["goals.wants_website", "presence.owns_domain", "presence.website_url"],
      });
      return { plan: website.planKey, reasons };
    }
  }

  reasons.push({
    code: "free_is_correct",
    text: "Free is the right answer for now. Nothing you have told me needs a paid plan.",
    factKeys: [],
  });
  return { plan: "free", reasons };
}

/**
 * The talent plan this person's own answers justify, ignoring what the workspace
 * side needs.
 *
 * Honest in isolation on purpose. The "one plan at signup" rule is applied once,
 * in `recommend`, where the displaced need becomes an upgrade trigger instead of
 * disappearing. Suppressing it here as well would mean the product forgets that
 * she wanted a personal site.
 */
export function chooseTalentPlan(
  brief: Brief,
  ents: TulalaEntitlements,
): { plan: PlanKey; reasons: Reason[] } {
  const reasons: Reason[] = [];

  // A personal site on a personal domain is the Portfolio tier.
  const wantsOwnSite =
    booleanFact(brief, "goals.wants_website") === true ||
    booleanFact(brief, "presence.owns_domain") === true;
  if (wantsOwnSite) {
    const portfolio = firstSellable(ents, ["talent_portfolio", "talent_pro"]);
    if (portfolio) {
      reasons.push({
        code: "personal_site_wanted",
        text: `You want your own site under your own name, which is what ${portfolio.displayName} adds.`,
        factKeys: ["goals.wants_website", "presence.owns_domain"],
      });
      return { plan: portfolio.planKey, reasons };
    }
  }

  const position = stringFact(brief, "brand.price_position");
  if (position === "premium" || position === "luxury") {
    const pro = firstSellable(ents, ["talent_pro"]);
    if (pro) {
      reasons.push({
        code: "premium_positioning",
        text: `You place yourself at the ${position} end, and ${pro.displayName} is the presentation that matches it.`,
        factKeys: ["brand.price_position"],
      });
      return { plan: pro.planKey, reasons };
    }
  }

  reasons.push({
    code: "talent_free_is_enough",
    text: "Your profile costs nothing. Standard is a real tier, not a trial.",
    factKeys: [],
  });
  return { plan: "talent_basic", reasons };
}

export function isPaid(ents: TulalaEntitlements, planKey: PlanKey | null): boolean {
  if (!planKey) return false;
  const option = planOption(ents, planKey);
  return option ? (option.monthlyPriceCents ?? 0) > 0 : false;
}

/**
 * Which single plan gets sold.
 *
 * A paid workspace outranks a paid talent plan: the operation is the thing with
 * revenue attached, and it is the answer the plan's own worked case demands
 * (Maria is told Studio; her personal profile is free). When neither side is
 * paid there is nothing to sell, and saying so is the point of "fit, not force".
 */
export function chooseWhatToSell(
  ents: TulalaEntitlements,
  plans: { workspace: PlanKey | null; talent: PlanKey | null },
): PlanFamily | null {
  if (isPaid(ents, plans.workspace)) return "workspace";
  if (isPaid(ents, plans.talent)) return "talent";
  return null;
}

// ─── Upgrade triggers ─────────────────────────────────────────────────────────

/**
 * The conditions that would make a paid plan genuinely correct later.
 *
 * This is what "fit, not force" is, structurally. Told Free and meaning it
 * leaves nothing behind, so the only remaining tactic for the business is to ask
 * again later and hope. A trigger turns that into timing: the Account Strategist
 * fires when the condition is actually observed, which is the first moment the
 * upgrade is true.
 *
 * Every trigger key must be machine-checkable against real account state. "She
 * might grow" is not a trigger.
 */
export function proposeUpgradeTriggers(
  brief: Brief,
  decision: { structure: StructureDecision; plans: PlanDecision },
): UpgradeTriggerProposal[] {
  const triggers: UpgradeTriggerProposal[] = [];
  const workspaceIsFree = decision.plans.workspace === "free" || !decision.structure.workspace;

  if (workspaceIsFree) {
    // The nail artist working alone from home. Correct answer today, and the
    // one condition that changes it.
    triggers.push({
      triggerKey: "roster_seat_needed",
      targetPackage: "workspace",
      targetTier: "studio",
      rationale:
        "When someone else starts taking bookings through you, and you keep a share of it, a paid workspace becomes the honest answer.",
    });
  }

  const hasNoSite =
    stringFact(brief, "presence.website_url") === null &&
    booleanFact(brief, "presence.owns_domain") !== true;
  if (hasNoSite && !decision.structure.workspace) {
    triggers.push({
      triggerKey: "own_domain_wanted",
      targetPackage: "workspace",
      targetTier: "website",
      rationale:
        "When you want an address of your own rather than a page on ours, that is the moment a site plan is worth paying for.",
    });
  }

  if (booleanFact(brief, "goals.wants_to_grow_team") === true && workspaceIsFree) {
    triggers.push({
      triggerKey: "stated_hiring_intent",
      targetPackage: "workspace",
      targetTier: "studio",
      rationale:
        "You mentioned bringing people on. Nothing to pay for until they are actually here.",
    });
  }

  // Detected but deliberately not sold at signup: a second workspace shape.
  // Recorded as a growth path because signup provisions exactly one workspace,
  // respecting the one-free-workspace-per-owner rule.
  if (
    decision.structure.workspace &&
    booleanFact(brief, "business.represents_others") === true &&
    booleanFact(brief, "business.has_staff") === true &&
    decision.structure.workspaceType === "talent"
  ) {
    triggers.push({
      triggerKey: "second_workspace_shape_needed",
      targetPackage: "workspace",
      targetTier: "agency",
      rationale:
        "You described both a roster you book out and a place with its own staff. Those can run as two workspaces when you are ready; one is enough to start.",
    });
  }

  return triggers;
}
