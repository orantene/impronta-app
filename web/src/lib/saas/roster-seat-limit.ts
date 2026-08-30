import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_SEAT_CAPS } from "@/lib/saas/plan-seat-caps";

type AgencySeatRow = {
  plan_tier: string | null;
  talent_seat_limit: number | null;
};

const FREE_DEFAULT_PUBLIC_PROFILE_CAP = PLAN_SEAT_CAPS.free ?? 5;

export type RosterSeatAvailability =
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

export function evaluateRosterSeatAvailability(input: {
  planTier: string | null;
  limit: number | null;
  current: number;
  additionalSeats?: number;
}): RosterSeatAvailability {
  const additionalSeats = Math.max(
    1,
    Math.trunc(input.additionalSeats ?? 1),
  );
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

  if (limit === 0) {
    // A zero cap is not "you ran out of seats" — it is a plan that has no
    // talent roster at all (Website). Saying "upgrade to add more" would be
    // a lie about what the customer bought.
    return {
      ok: false,
      planTier: input.planTier,
      limit,
      current,
      after,
      message:
        "This plan does not include a talent roster. Upgrade to Studio to add talent.",
    };
  }

  return {
    ok: false,
    planTier: input.planTier,
    limit,
    current,
    after,
    message:
      input.planTier === "free"
        ? `This workspace has reached the Free plan limit (${limit} profiles). Upgrade to Studio to add more.`
        : `This workspace reached its plan limit (${limit} profiles). Upgrade to add more.`,
  };
}

export function resolvePublicRosterDisplayCap(
  planTier: string | null,
  limit: number | null,
): number | null {
  if (limit != null) {
    return Math.max(0, Math.trunc(limit));
  }
  if (planTier === "free") {
    return FREE_DEFAULT_PUBLIC_PROFILE_CAP;
  }
  return null;
}

export async function checkRosterSeatAvailability(
  supabase: SupabaseClient,
  tenantId: string,
  additionalSeats = 1,
): Promise<RosterSeatAvailability> {
  const [{ data: agency }, rosterRes] = await Promise.all([
    supabase
      .from("agencies")
      .select("plan_tier, talent_seat_limit")
      .eq("id", tenantId)
      .maybeSingle<AgencySeatRow>(),
    supabase
      .from("agency_talent_roster")
      .select("id, talent_profiles!inner(profile_kind)", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .eq("talent_profiles.profile_kind", "person"),
  ]);

  const current = Math.max(0, Math.trunc(rosterRes.count ?? 0));

  if (!agency) {
    // SECURITY (fail-closed): the agencies row is unreadable — RLS denial, a
    // bogus / cross-tenant id, a deleted agency, or a query error that yields
    // `data: null`. We MUST distinguish this from a legitimately-present paid
    // agency whose `talent_seat_limit` is null (genuinely uncapped): the old
    // `agency?.talent_seat_limit ?? null` conflated both into the
    // `limit: null` → UNLIMITED path, so the seat cap silently stopped
    // applying in exactly the states where it most needs to hold. Deny
    // instead of fail-open. (evaluateRosterSeatAvailability stays pure —
    // `limit: null` remains correctly unlimited for a *read* paid agency.)
    const after = current + additionalSeats;
    return {
      ok: false,
      planTier: null,
      limit: 0,
      current,
      after,
      message:
        "This workspace's plan could not be verified. Seat changes are " +
        "blocked until it can be confirmed.",
    };
  }

  return evaluateRosterSeatAvailability({
    planTier: agency.plan_tier ?? null,
    limit: agency.talent_seat_limit ?? null,
    current,
    additionalSeats,
  });
}
