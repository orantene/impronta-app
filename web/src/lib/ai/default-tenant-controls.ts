/**
 * TUL-1624 · Default AI ceilings by plan, for every workspace that has no `ai_tenant_controls` row (that is every real
 * workspace: only the hub tenant is seeded). A row, when one exists, always wins: this table is only the floor that
 * makes "no row" mean "capped", not "uncapped". Numbers are per calendar month (UTC) and per minute. Unknown or missing
 * plan = the strictest tier, so a workspace we cannot classify is never the uncapped one.
 *
 * Proposed starting values (cents are USD): tune here, or override per workspace with a row; no migration needed.
 */
import type { WorkspacePlanTier } from "@/lib/platform/plan-override";

export type DefaultAiControls = {
  monthlySpendCapCents: number;
  maxRequestsPerMinute: number;
  maxRequestsPerMonth: number;
};

export const DEFAULT_AI_CONTROLS_BY_PLAN: Readonly<Record<WorkspacePlanTier, DefaultAiControls>> = {
  free: { monthlySpendCapCents: 300, maxRequestsPerMinute: 10, maxRequestsPerMonth: 150 },
  website: { monthlySpendCapCents: 1_000, maxRequestsPerMinute: 20, maxRequestsPerMonth: 500 },
  studio: { monthlySpendCapCents: 2_500, maxRequestsPerMinute: 30, maxRequestsPerMonth: 1_500 },
  agency: { monthlySpendCapCents: 7_500, maxRequestsPerMinute: 60, maxRequestsPerMonth: 5_000 },
  network: { monthlySpendCapCents: 20_000, maxRequestsPerMinute: 120, maxRequestsPerMonth: 15_000 },
};

export function resolveDefaultAiControls(planTier: string | null | undefined): DefaultAiControls {
  const key = (planTier ?? "").trim().toLowerCase();
  return (DEFAULT_AI_CONTROLS_BY_PLAN as Record<string, DefaultAiControls | undefined>)[key] ?? DEFAULT_AI_CONTROLS_BY_PLAN.free;
}
