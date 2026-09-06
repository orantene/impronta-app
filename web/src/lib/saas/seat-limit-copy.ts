import { PLAN_CATALOG, type PlanKey } from "@/lib/access/plan-catalog";
import { PLAN_SEAT_CAPS, type SeatCapPlan } from "@/lib/saas/plan-seat-caps";
import { PLAN_LIMITS } from "@/lib/access/plan-limits";

/**
 * seat-limit-copy.ts — what to offer someone who just hit a seat cap.
 *
 * WHY IT IS DERIVED
 * ─────────────────
 * The roster and team seat messages both ended in a typed "Upgrade to Studio to
 * add more". Studio is the right answer for both today, which is exactly why it
 * survived: a hardcoded plan name that happens to be correct is invisible until
 * the caps move. The same sentence shape has already been wrong three times on
 * other surfaces — "Upgrade to Studio" on a page cap Website lifts for less,
 * "three pages" against an allowance of five, and a custom-domain lock naming a
 * plan whose checkout refuses.
 *
 * THE TRAP THIS HELPER EXISTS TO AVOID
 * ────────────────────────────────────
 * A seat paywall must offer a plan that RAISES the cap, not merely one that
 * costs more. `PLAN_SEAT_CAPS.website` is 0: Website is a site product that
 * deliberately seats nobody. It is ranked between Free and Studio and costs
 * more than Free, so any "next plan up" or "cheapest paid plan" rule would
 * offer it to someone who just ran out of roster seats — sending them to a tier
 * that seats FEWER people than the one they are on, for money.
 *
 * So the rule is strictly: lowest rank above the caller whose cap is genuinely
 * larger (or unlimited). Nothing else qualifies as an upgrade for this wall.
 */

export type SeatKind = "roster" | "team";

/** The enforced cap for a plan. `null` = unlimited. */
export function seatCapFor(kind: SeatKind, plan: PlanKey): number | null {
  if (kind === "roster") {
    return plan in PLAN_SEAT_CAPS ? PLAN_SEAT_CAPS[plan as SeatCapPlan] : null;
  }
  return PLAN_LIMITS[plan]?.max_team_seats ?? null;
}

/**
 * Cheapest plan above `current` whose cap is genuinely larger, or null when
 * nothing above it raises the limit.
 *
 * Ordered by RANK, not price: rank is the upgrade ladder, and Website sits
 * between Free and Studio while seating nobody.
 */
export function cheapestPlanRaisingSeatCap(
  kind: SeatKind,
  current: PlanKey,
): { planKey: PlanKey; displayName: string; isSelfServe: boolean } | null {
  const currentDef = PLAN_CATALOG[current];
  if (!currentDef) return null;

  const currentCap = seatCapFor(kind, current);
  // Already unlimited: there is nothing to sell, and offering anything would be
  // a paywall on a wall that does not exist.
  if (currentCap === null) return null;

  const candidates = Object.values(PLAN_CATALOG)
    .filter(
      (p) =>
        p.audience === currentDef.audience &&
        p.isVisible &&
        !p.isArchived &&
        p.rank > currentDef.rank,
    )
    .sort((a, b) => a.rank - b.rank);

  for (const plan of candidates) {
    const cap = seatCapFor(kind, plan.key);
    // `null` is unlimited and always qualifies. A finite cap must be strictly
    // larger — equal is not an upgrade, and smaller is Website.
    if (cap === null || cap > currentCap) {
      return {
        planKey: plan.key,
        displayName: plan.displayName,
        isSelfServe: plan.isSelfServe,
      };
    }
  }

  return null;
}

/**
 * The sentence shown when a seat cap refuses.
 *
 * Never carries a price: prices live in `product_prices`, and every copy of one
 * in code has eventually drifted from what the card is actually charged.
 */
export function seatLimitMessage(args: {
  kind: SeatKind;
  planTier: string | null;
  limit: number;
  locale?: string;
}): string {
  const { kind, limit } = args;
  const es = (args.locale ?? "en") === "es";
  const plan = (
    args.planTier && args.planTier in PLAN_CATALOG ? args.planTier : "free"
  ) as PlanKey;

  const noun = kind === "roster"
    ? (es ? "perfiles" : "profiles")
    : (es ? "lugares de equipo, incluidas las invitaciones pendientes" : "team seats, including pending invites");

  const planName = PLAN_CATALOG[plan]?.displayName ?? "Free";
  const reached = es
    ? `Este espacio alcanzó el límite del plan ${planName} (${limit} ${noun}).`
    : `This workspace has reached the ${planName} plan limit (${limit} ${noun}).`;

  const upgrade = cheapestPlanRaisingSeatCap(kind, plan);

  if (!upgrade) {
    return es
      ? `${reached} Hablemos de las opciones.`
      : `${reached} Talk to us about the options.`;
  }
  if (!upgrade.isSelfServe) {
    return es
      ? `${reached} ${upgrade.displayName} sube el límite. Hablemos para activarlo.`
      : `${reached} ${upgrade.displayName} raises it. Talk to us to enable it.`;
  }
  return es
    ? `${reached} Mejora a ${upgrade.displayName} para subir el límite.`
    : `${reached} Upgrade to ${upgrade.displayName} to raise it.`;
}
