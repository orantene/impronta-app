import type { SupabaseClient } from "@supabase/supabase-js";

import { PLAN_LIMITS } from "@/lib/access/plan-limits";
import { seatLimitMessage } from "@/lib/saas/seat-limit-copy";
import type { PlanKey } from "@/lib/access/plan-catalog";

/**
 * Team-seat enforcement — the workspace-member equivalent of
 * `roster-seat-limit.ts`.
 *
 * Until 2026-08-21 team seats were DECLARED in two places and enforced in
 * none: `lib/access/plan-limits.ts` said free=2 / studio=10 / agency=25
 * while the `plan_tier_caps` reference table said 1 / 3 / 12, and an
 * owner could invite an unbounded number of teammates on any plan. This
 * module is the first real enforcement, and `PLAN_LIMITS.max_team_seats`
 * is now the single canonical ladder (free=2, studio=3, agency and
 * network unlimited); the migration mirrors it into `plan_tier_caps`.
 *
 * What occupies a seat:
 *   - `agency_memberships` in status active / invited / pending_acceptance
 *   - a `team_invite_tokens` row that is not redeemed, not revoked and not
 *     expired — an outstanding invite holds the seat it is going to
 *     become, otherwise a workspace could blow past the cap by sending
 *     twenty invites at once and letting them all land.
 *
 * Deliberately NOT enforced: platform-admin membership inserts in
 * `app/(workspace)/platform/admin/tenants/actions.ts` and
 * `actions-control.ts`. Platform staff can seat anyone anywhere — that
 * override is intentional and is how support gets into a workspace.
 */

type AgencyPlanRow = {
  plan_tier: string | null;
};

export type TeamSeatAvailability =
  | {
      ok: true;
      planTier: string | null;
      limit: number | null;
      current: number;
      after: number;
    }
  | {
      ok: false;
      planTier: string | null;
      limit: number;
      current: number;
      after: number;
      message: string;
    };

/** Team-seat cap for a plan tier. `null` = unlimited. Unknown → Free. */
export function teamSeatCapForPlan(planTier: string | null): number | null {
  const key = planTier ?? "";
  return key in PLAN_LIMITS
    ? PLAN_LIMITS[key as PlanKey].max_team_seats
    : PLAN_LIMITS.free.max_team_seats;
}

/**
 * Pure evaluator — no IO, unit-testable.
 *
 * `additionalSeats` defaults to 1 and, unlike the roster evaluator, may be
 * 0: the redeem path re-checks a seat that the pending invite token is
 * ALREADY counted in, so it asks "does the current usage fit?" rather than
 * "does one more fit?".
 */
export function evaluateTeamSeatAvailability(input: {
  planTier: string | null;
  limit: number | null;
  current: number;
  additionalSeats?: number;
  /** Operator\'s dashboard locale. Defaults to English. */
  locale?: string;
}): TeamSeatAvailability {
  const additionalSeats = Math.max(0, Math.trunc(input.additionalSeats ?? 1));
  const current = Math.max(0, Math.trunc(input.current));
  const after = current + additionalSeats;

  if (input.limit == null) {
    return {
      ok: true,
      planTier: input.planTier,
      limit: null,
      current,
      after,
    };
  }

  const limit = Math.max(0, Math.trunc(input.limit));
  if (after <= limit) {
    return {
      ok: true,
      planTier: input.planTier,
      limit,
      current,
      after,
    };
  }

  return {
    ok: false,
    planTier: input.planTier,
    limit,
    current,
    after,
    // Same derived helper as the roster wall. See seat-limit-copy.ts for why a
    // seat paywall must offer a plan that RAISES the cap rather than the next
    // one up the ladder.
    message: seatLimitMessage({
      kind: "team",
      planTier: input.planTier,
      limit,
      locale: input.locale,
    }),
  };
}

/**
 * Load the plan tier + current seat usage and delegate to the evaluator.
 *
 * Pass a service-role client: the counts must be exact, and the invite
 * table is not readable by a member session.
 */
export async function checkTeamSeatAvailability(
  supabase: SupabaseClient,
  tenantId: string,
  additionalSeats = 1,
): Promise<TeamSeatAvailability> {
  const nowIso = new Date().toISOString();

  const [{ data: agency }, membershipRes, inviteRes] = await Promise.all([
    supabase
      .from("agencies")
      .select("plan_tier")
      .eq("id", tenantId)
      .maybeSingle<AgencyPlanRow>(),
    supabase
      .from("agency_memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["active", "invited", "pending_acceptance"]),
    supabase
      .from("team_invite_tokens")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("redeemed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso),
  ]);

  const current =
    Math.max(0, Math.trunc(membershipRes.count ?? 0)) +
    Math.max(0, Math.trunc(inviteRes.count ?? 0));

  if (!agency) {
    // SECURITY (fail-closed): the agencies row is unreadable — RLS denial,
    // a bogus / cross-tenant id, a deleted agency, or a query error that
    // yields `data: null`. We must not conflate that with a legitimately
    // uncapped paid plan, or the cap would silently stop applying in
    // exactly the states where it most needs to hold. Same rule as
    // `checkRosterSeatAvailability`.
    return {
      ok: false,
      planTier: null,
      limit: 0,
      current,
      after: current + Math.max(0, Math.trunc(additionalSeats)),
      message:
        "This workspace's plan could not be verified. Team changes are " +
        "blocked until it can be confirmed.",
    };
  }

  const planTier = agency.plan_tier ?? null;
  return evaluateTeamSeatAvailability({
    planTier,
    limit: teamSeatCapForPlan(planTier),
    current,
    additionalSeats,
  });
}
