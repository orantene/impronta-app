/**
 * Plan → capability entitlement predicate.
 *
 * WHAT CHANGED (2026-09-02)
 * ─────────────────────────
 * This file used to BE the entitlement model: a `Record<PlanKey, Set<Cap>>`
 * where every plan mapped to `ALL_CAPS`. Its own header promised "Track C
 * tightens the per-plan subsets", and Track C never landed, so for the whole
 * life of the product every plan granted every capability and the pricing page
 * was selling differences the resolver did not enforce.
 *
 * The subsets now live in `public.plan_capabilities`, loaded by
 * `plan-entitlements-store.ts`. This module keeps only the PREDICATE, which
 * stays pure and synchronous so it can be imported by client bundles and by
 * test lanes that have no Supabase (a `server-only` import here would break
 * both — see reference_server_only_import_breaks_test_lanes).
 *
 * THE DEFAULT IS GRANTED
 * ──────────────────────
 * A missing entry means granted. That is not laziness; it is what makes this
 * migration behaviour-neutral and what keeps a newly-registered capability from
 * locking every tenant out of a shipped feature before someone packages it.
 * The safety argument is in the migration header: the plan check is the LAST
 * gate in `authorize()`, after role, membership, tenant status and platform
 * role, so a miss can only fail to upsell — it cannot grant access to anyone
 * who was not already entitled.
 */

import type { CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";

/**
 * `${planKey} ${capabilityKey}` → included.
 *
 * A flat string-keyed map rather than nested records: it is built once per
 * cache period from a flat DB result, read on the hottest path in the product,
 * and never mutated.
 */
export type PlanEntitlementMap = ReadonlyMap<string, boolean>;

/** The map key for one cell. Exported so the admin surface builds keys the same way. */
export function entitlementKey(
  plan: PlanKey | string,
  capability: CapabilityKey | string,
): string {
  return `${plan} ${capability}`;
}

/**
 * Does `plan` grant `cap`, given the loaded matrix?
 *
 * `entitlements` omitted or empty → granted, the documented default.
 */
export function planGrantsCapability(
  plan: PlanKey,
  cap: CapabilityKey,
  entitlements?: PlanEntitlementMap,
): boolean {
  if (!entitlements || entitlements.size === 0) return true;
  const included = entitlements.get(entitlementKey(plan, cap));
  return included ?? true;
}

/**
 * Every cell explicitly recorded for a plan. For the admin matrix and for
 * explaining a denial; not used on the authorization path.
 */
export function packagedCapabilitiesForPlan(
  plan: PlanKey,
  entitlements: PlanEntitlementMap,
): { capability: string; included: boolean }[] {
  const prefix = `${plan} `;
  const out: { capability: string; included: boolean }[] = [];
  for (const [key, included] of entitlements) {
    if (key.startsWith(prefix)) {
      out.push({ capability: key.slice(prefix.length), included });
    }
  }
  return out.sort((a, b) => a.capability.localeCompare(b.capability));
}
