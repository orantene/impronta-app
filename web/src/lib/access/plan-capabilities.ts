/**
 * Plan → capability mapping (TS mirror of future `plan_capabilities` table).
 *
 * **Phase 1 stance: permissive.** Today's `requireCapability()` does NOT
 * gate by plan — only by role. UI tier-locking (the "Locked" overlay on
 * cards) is a presentation concern, not an authorization concern. Mirroring
 * that exactly: every plan grants every capability the role grants.
 *
 * Why: enabling plan-level enforcement here would silently break calls that
 * work today (e.g. a Free-plan tenant with role=admin calling
 * `requireCapability('edit_cms_pages')`). That's a behavior change disguised
 * as a refactor.
 *
 * Track C ships the real plan→capability matrix as DB rows derived from
 * `TIER_BANDS` and turns on enforcement deliberately, with a feature flag and
 * a per-tenant rollout. Until then, this file exists as the structure that
 * Track C will populate, but every plan grants the full set.
 *
 * See §6/§3 of the architecture brief: "the resolver in B.1 IS the legacy
 * behavior, just relocated."
 */

import { CAPABILITY_KEYS, type CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";

const ALL_CAPS: ReadonlySet<CapabilityKey> = new Set<CapabilityKey>(CAPABILITY_KEYS);

/**
 * Plan-capability grants. Phase 1: every plan grants every capability
 * (permissive — matches current behavior). Track C replaces this with the
 * true per-plan subsets read from the `plan_capabilities` table.
 */
export const PLAN_CAPABILITIES: Record<PlanKey, ReadonlySet<CapabilityKey>> = {
  free: ALL_CAPS,
  studio: ALL_CAPS,
  agency: ALL_CAPS,
  network: ALL_CAPS,
  legacy: ALL_CAPS,
};

export function planGrantsCapability(
  plan: PlanKey,
  cap: CapabilityKey,
): boolean {
  return PLAN_CAPABILITIES[plan].has(cap);
}

/**
 * Phase 1 feature flag. Currently `false`: the resolver does not consult
 * plan-capability grants. Set to `true` in Track C.6 once the DB is the
 * canonical source and the per-tenant rollout has been verified.
 */
export const ENFORCE_PLAN_CAPABILITIES = false;
