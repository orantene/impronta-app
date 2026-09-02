/**
 * Which plans may hold an EXCLUSIVE representation relationship — the one set.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * On 2026-09-02 this predicate was declared in four places with two different
 * answers:
 *
 *   access/registration-modes.ts      { studio, agency, network, legacy }
 *   inquiry/owning-party-resolver.ts  { studio, agency, network, hub-network }
 *   inquiry/picker-talent-guard.ts    { studio, agency, network, hub-network }
 *   agency/exclusivity-resolver.ts    { studio, agency, network, hub-network }
 *
 * The admin mode-picker (the first one) would OFFER exclusive representation to
 * a `legacy` workspace, and then the ownership resolver (the other three) would
 * decline to treat the resulting relationship as exclusive — a workspace told it
 * had exclusivity, silently not getting it. No live tenant was on `legacy` when
 * this was found, so it never fired; it was one plan change away from firing.
 *
 * MEMBERSHIP, and why each entry is here
 * ──────────────────────────────────────
 *   studio / agency / network  the paid tiers that can take a cut of a roster.
 *                              Free cannot: it is friend-link access with no
 *                              commission, so there is nothing to be exclusive
 *                              ABOUT. `website` seats nobody at all.
 *   legacy                     the grandfathered pre-pricing tenant. It holds
 *                              the full capability set everywhere else
 *                              (PLAN_LIMITS, BUILDER_PLAN_POLICY), so excluding
 *                              it here was the outlier, not the rule.
 *   hub-network                NOT a plan key. It is a UI-layer alias for
 *                              `network` used by the admin shell's booking tabs
 *                              and the Discover settings page. It is never
 *                              stored in `agencies.plan_tier`, but raw strings
 *                              from those surfaces reach this predicate, so it
 *                              stays as an accepted alias rather than a silent
 *                              false.
 *
 * Adding a plan to this set is a COMMERCIAL decision (exclusivity is a paid
 * capability), so it is made here and nowhere else. `exclusive-plan-tiers.test.ts`
 * fails if a caller reintroduces a local copy.
 */

import type { PlanKey } from "./plan-catalog";

/** Plan keys that may grant exclusive representation. */
export const EXCLUSIVE_PLAN_KEYS: readonly PlanKey[] = [
  "studio",
  "agency",
  "network",
  "legacy",
] as const;

/**
 * The accepted raw `plan_tier` strings, including the `hub-network` UI alias.
 * Callers that hold a typed `PlanKey` should prefer `EXCLUSIVE_PLAN_KEYS`.
 */
export const EXCLUSIVE_PLAN_TIERS: ReadonlySet<string> = new Set<string>([
  ...EXCLUSIVE_PLAN_KEYS,
  // UI alias for `network`; see the header.
  "hub-network",
]);

/**
 * Can this plan hold an exclusive representation relationship?
 * Accepts a raw column value, so null / unknown fails closed.
 */
export function planAllowsExclusivity(
  planTier: string | null | undefined,
): boolean {
  return !!planTier && EXCLUSIVE_PLAN_TIERS.has(planTier);
}
