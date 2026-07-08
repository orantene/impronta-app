/**
 * Pure image-generation quota + cost math (no server-only / DB / sharp imports)
 * so it stays unit-testable. The DB + OpenAI + storage orchestration lives in
 * ai-image-generation.ts, which re-exports these.
 *
 * Cost-first by design (the user's explicit worry): the caps are a hard fuse,
 * small enough that even the top tier stays well under ~$10/month of DALL·E.
 */

/** Monthly per-tenant image cap by plan tier. */
export const IMAGE_QUOTA_BY_PLAN: Record<string, number> = {
  free: 3,
  studio: 30,
  agency: 120,
};

export const DEFAULT_IMAGE_QUOTA = IMAGE_QUOTA_BY_PLAN.free;

export function imageQuotaForPlan(plan: string | null | undefined): number {
  if (typeof plan === "string" && plan in IMAGE_QUOTA_BY_PLAN) {
    return IMAGE_QUOTA_BY_PLAN[plan];
  }
  return DEFAULT_IMAGE_QUOTA;
}

export type QuotaDecision = { allowed: boolean; remaining: number };

/** Pure decision from a used-count + cap. Never returns a negative remaining. */
export function quotaDecision(used: number, cap: number): QuotaDecision {
  const remaining = Math.max(0, cap - Math.max(0, used));
  return { allowed: remaining > 0, remaining };
}

// DALL·E 3 1024×1024 list price (July 2026). Verify against current OpenAI
// pricing before launch; used only for cost accounting + the monthly counter.
export const IMAGE_GENERATION_COST_USD = 0.08;

export function estimateImageCostUsd(): number {
  return IMAGE_GENERATION_COST_USD;
}
