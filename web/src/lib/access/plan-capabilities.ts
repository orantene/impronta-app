/**
 * Plan → capability mapping (TS mirror of future `plan_capabilities` table).
 *
 * Phase 1: every plan grants every capability (permissive). The resolver
 * runs the plan check unconditionally, but with this map it always passes
 * — same behavior as the legacy `requireCapability` which checked only
 * role. Track C tightens the per-plan subsets in this same file (or
 * replaces it with DB-driven reads) and the resolver starts denying
 * automatically.
 */

import { CAPABILITY_KEYS, type CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";

const ALL_CAPS: ReadonlySet<CapabilityKey> = new Set<CapabilityKey>(CAPABILITY_KEYS);

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
