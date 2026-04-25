/**
 * Limit resolver — `tenantLimit(limitKey, tenantId)` and friends.
 *
 * Phase 1: reads from `plan-limits.ts` (TS mirror) using the tenant's
 * `agencies.plan_tier`. Track C swaps the source to the `plan_limits` DB
 * table; the API surface stays the same.
 *
 * Limit values are interpreted:
 *   - `null` = unlimited (no enforcement)
 *   - `n >= 0` = hard cap at n
 *
 * Limits are checked at action time (caller invokes `assertWithinLimit`
 * before consuming the resource), not in the access resolver. Capability
 * answers "are you allowed to attempt this?"; limit answers "do you have
 * quota left?".
 */

import { findTenantMembership } from "@/lib/saas/tenant";

import {
  isKnownLimit,
  PLAN_LIMITS,
  type LimitKey,
} from "./plan-limits";
import { isKnownPlan, type PlanKey } from "./plan-catalog";

export class OverLimitError extends Error {
  constructor(
    public readonly limitKey: string,
    public readonly limit: number | null,
    public readonly tenantId: string,
  ) {
    super(
      `over_limit: ${limitKey} (limit=${limit ?? "unlimited"}, tenant=${tenantId})`,
    );
    this.name = "OverLimitError";
  }
}

/**
 * Look up the plan-defined limit for a tenant.
 *
 * Returns `null` when the limit is unlimited or when the limit/plan is
 * unknown (fail-open in Phase 1; Track C tightens via DB constraints).
 */
export async function tenantLimit(
  limitKey: LimitKey | string,
  tenantId: string,
): Promise<number | null> {
  if (!isKnownLimit(limitKey)) return null;

  const membership = await findTenantMembership(tenantId);
  if (!membership) return null;

  // The membership doesn't currently expose plan_tier; re-fetch via tenant
  // resolution would be heavier than needed. Track C ships a plan-aware
  // membership cache; for now, callers that need plan-tier limits should
  // pass `agency.plan_tier` directly via a forthcoming overload. As a safe
  // default, return null (unlimited) when plan unknown.
  const plan = (membership as { agency_plan_tier?: unknown }).agency_plan_tier;
  if (typeof plan !== "string" || !isKnownPlan(plan)) {
    return null;
  }

  return PLAN_LIMITS[plan as PlanKey][limitKey];
}

/**
 * Read current usage for a tenant + counter key from
 * `agency_usage_counters`. Phase 1 returns 0 if the counter row doesn't
 * exist; Track C wires this to the actual table read.
 */
export async function tenantUsage(
  _counterKey: string,
  _tenantId: string,
): Promise<number> {
  // Track C will implement: SELECT counter_value FROM agency_usage_counters
  //                         WHERE tenant_id = $1 AND counter_key = $2
  // Phase 1 stub returns 0 — limit checks are accurate when limits are NULL
  // (unlimited), and Phase 1 doesn't enforce numeric limits anyway.
  return 0;
}

/**
 * Returns `null` (unlimited) or the headroom remaining before hitting the
 * limit. A return value of `<= 0` means the tenant is at or over the cap.
 */
export async function tenantLimitRemaining(
  limitKey: LimitKey | string,
  tenantId: string,
): Promise<number | null> {
  const limit = await tenantLimit(limitKey, tenantId);
  if (limit === null) return null;
  const used = await tenantUsage(limitKey, tenantId);
  return limit - used;
}

/**
 * Throws `OverLimitError` when the tenant is at/over the cap. Call right
 * before consuming a counted resource (e.g. inserting a new team member).
 *
 * Phase 1: no-op for limits that are null (unlimited). Track C wires the
 * real usage counter and turns this into a hard gate.
 */
export async function assertWithinLimit(
  limitKey: LimitKey | string,
  tenantId: string,
): Promise<void> {
  const remaining = await tenantLimitRemaining(limitKey, tenantId);
  if (remaining === null) return;
  if (remaining <= 0) {
    const limit = await tenantLimit(limitKey, tenantId);
    throw new OverLimitError(String(limitKey), limit, tenantId);
  }
}
