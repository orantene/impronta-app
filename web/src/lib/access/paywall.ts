/**
 * paywall.ts — when a plan denies a capability, which plan grants it.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `plan_capabilities` gained its first real denial rows on 2026-09-03, and
 * nothing existed to explain one. A blocked operator got an `AccessDeniedError`,
 * which surfaces as a generic failure. A silent 403 is worse than no gate: the
 * gate costs the customer the feature AND costs us the upsell, which is the
 * entire reason the gate exists.
 *
 * So every plan denial resolves the cheapest plan that would grant it, from the
 * SAME matrix that produced the denial. Not from a hard-coded "upgrade to
 * Studio" string — that sentence was already wrong once in this codebase, on
 * the page cap, where it sent shops to a $29 plan when a $12 one lifted the
 * limit.
 *
 * WHAT "CHEAPEST" MEANS HERE
 * ──────────────────────────
 * Plan RANK, not price. Rank is the upgrade ladder within an audience
 * (free 0 → website 1 → studio 2 → agency 3 → network 4) and it is what the
 * upgrade path already uses. Price would be the wrong key: Website is $12 and
 * ranked below Studio at $29, so a price sort would sometimes recommend a
 * sideways move into a tier that seats nobody. Anyone on Free with a roster who
 * is told to buy Website has been sent to a functional downgrade.
 *
 * The answer can be null — no self-serve plan grants it, e.g. a
 * Network-only capability. Null means "talk to us", not "buy the next tier",
 * and callers must render that differently rather than inventing a CTA.
 */

import { PLAN_CATALOG, type PlanKey } from "./plan-catalog";
import {
  planGrantsCapability,
  type PlanEntitlementMap,
} from "./plan-capabilities";
import type { CapabilityKey } from "./capabilities";

export type PaywallUpgrade = {
  /** Plan key the caller should offer. */
  planKey: PlanKey;
  /** Customer-facing name, e.g. "Agency". */
  displayName: string;
  /** True when the customer can buy it themselves; false means sales-led. */
  isSelfServe: boolean;
};

/**
 * The cheapest plan in the same audience that grants `capability`, or null.
 *
 * `currentPlan` bounds the search: only plans ABOVE it are offers. Suggesting a
 * plan the customer already has, or one below them, is not an upgrade path.
 */
export function resolveUpgradeForCapability(
  currentPlan: PlanKey,
  capability: CapabilityKey,
  entitlements: PlanEntitlementMap,
): PaywallUpgrade | null {
  const current = PLAN_CATALOG[currentPlan];
  if (!current) return null;

  const candidates = Object.values(PLAN_CATALOG)
    .filter(
      (p) =>
        p.audience === current.audience &&
        !p.isArchived &&
        p.isVisible &&
        p.rank > current.rank,
    )
    .sort((a, b) => a.rank - b.rank);

  for (const plan of candidates) {
    if (planGrantsCapability(plan.key, capability, entitlements)) {
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
 * One sentence for the operator, in their dashboard locale.
 *
 * Shipped English-only in #1722, which was wrong on a product whose dashboard
 * follows the user's language: a Spanish-speaking operator hit a wall and got
 * an English explanation of why. Inline EN/ES rather than message-catalog keys
 * because this module is PURE — imported by client bundles and by `tsx --test`
 * lanes with no i18n runtime — and the same inline pattern is already used by
 * the marketing components.
 *
 * Deliberately does NOT include a price: prices live in `product_prices` and
 * every copy of one in code has eventually drifted from what the card is
 * actually charged.
 *
 * KNOWN LIMIT, stated rather than hidden: `capabilityDisplayName` comes from
 * the capability registry, which has ENGLISH NAMES ONLY. So a Spanish message
 * reads "Pitches es parte de Agency" — Spanish sentence, English feature name.
 * That is better than a wholly English sentence and worse than a translated
 * one. Fixing it properly means adding Spanish display names to all 101
 * registry entries, which is a separate piece of work and not one to smuggle
 * into a paywall fix.
 */
export function paywallMessage(
  capabilityDisplayName: string,
  upgrade: PaywallUpgrade | null,
  locale: string = "en",
): string {
  const es = locale === "es";

  if (!upgrade) {
    return es
      ? `${capabilityDisplayName} no está incluido en tu plan. Hablemos de las opciones.`
      : `${capabilityDisplayName} is not included in your plan. Talk to us about the options.`;
  }
  if (!upgrade.isSelfServe) {
    return es
      ? `${capabilityDisplayName} es parte de ${upgrade.displayName}. Hablemos para activarlo.`
      : `${capabilityDisplayName} is part of ${upgrade.displayName}. Talk to us to enable it.`;
  }
  return es
    ? `${capabilityDisplayName} es parte de ${upgrade.displayName}. Mejora tu plan para activarlo.`
    : `${capabilityDisplayName} is part of ${upgrade.displayName}. Upgrade to turn it on.`;
}
