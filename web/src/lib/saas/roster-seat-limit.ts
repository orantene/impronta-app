import type { SupabaseClient } from "@supabase/supabase-js";

type AgencySeatRow = {
  plan_tier: string | null;
  talent_seat_limit: number | null;
};

const FREE_DEFAULT_PUBLIC_PROFILE_CAP = 5;

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
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .neq("status", "removed"),
  ]);

  return evaluateRosterSeatAvailability({
    planTier: agency?.plan_tier ?? null,
    limit: agency?.talent_seat_limit ?? null,
    current: rosterRes.count ?? 0,
    additionalSeats,
  });
}
