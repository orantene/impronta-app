/**
 * Talent tier label sync (TUL-1820).
 *
 * The talent shell seeds `state.talentTier` once from the server bridge
 * (`talentSelfProfile.talentTier`, itself derived from `talent_profiles
 * .talent_plan_key` through the effective-plan resolver, so a trialing Stripe
 * subscription already counts as the paid plan). A `useState` seed never
 * follows later props: after the Stripe success redirect the layout re-renders
 * with the paid tier, but the rail "Plan" chip and the Settings Plan row kept
 * the stale "Free". This helper decides when the client state must adopt a
 * fresh server value.
 *
 * Rule: adopt the server tier whenever it CHANGES between renders. An
 * unchanged server value never overrides a local value (the dev-only plan
 * switcher keeps working); a missing server value (prototype mode) is ignored.
 */
import type { TalentSubscriptionTier } from "./types";

export function nextTalentTier(
  current: TalentSubscriptionTier,
  previousBridgeTier: TalentSubscriptionTier | null,
  bridgeTier: TalentSubscriptionTier | null,
): TalentSubscriptionTier {
  if (bridgeTier == null) return current;
  if (bridgeTier === previousBridgeTier) return current;
  return bridgeTier;
}
