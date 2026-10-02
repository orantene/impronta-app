import "server-only";

/**
 * Server reads behind `resolveOfferingPolicy`: the talent defaults blob for a
 * set of offerings, and the effective cancellation window for one offering.
 * The pure chain lives in `offering-policy-resolver.ts`; this only fetches.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { resolveOfferingPolicy } from "@/lib/talent/offering-policy-resolver";

/**
 * `talent_profiles.selling_defaults` keyed by talent id. A failed read returns
 * `ok: false` so a charge is refused rather than silently priced without the
 * defaults the talent was shown.
 */
export async function loadSellingDefaultsByTalent(
  admin: SupabaseClient,
  talentProfileIds: readonly string[],
): Promise<{ ok: true; defaults: Map<string, unknown> } | { ok: false }> {
  const ids = [...new Set(talentProfileIds.filter((id) => typeof id === "string" && id))];
  const defaults = new Map<string, unknown>();
  if (ids.length === 0) return { ok: true, defaults };
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, selling_defaults")
    .in("id", ids);
  if (error) {
    logServerError("talent.offeringPolicy/sellingDefaults", error);
    return { ok: false };
  }
  for (const row of (data ?? []) as { id: string; selling_defaults: unknown }[]) {
    defaults.set(row.id, row.selling_defaults ?? {});
  }
  return { ok: true, defaults };
}

export type EffectiveBookingPolicy = {
  cancellationHours: number | null;
  depositPct: number | null;
  /** The talent who owns the offering, null for an agency-owned one. */
  talentProfileId: string | null;
};

/**
 * What this offering was sold under: offering value, then the talent default,
 * then the platform 24 h (window) and the deposit chain. Null fields on a read
 * failure or for a flexible agency offering; callers treat null as "no window".
 */
export async function loadEffectiveBookingPolicy(
  db: SupabaseClient,
  offeringId: string,
): Promise<EffectiveBookingPolicy | null> {
  const { data, error } = await db
    .from("talent_offerings")
    .select("cancellation_hours, talent_profile_id, reserve_mode, deposit_pct")
    .eq("id", offeringId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    cancellation_hours: number | null;
    talent_profile_id: string | null;
    reserve_mode: string | null;
    deposit_pct: number | null;
  };
  let sellingDefaults: unknown = null;
  if (row.talent_profile_id) {
    const loaded = await loadSellingDefaultsByTalent(db, [row.talent_profile_id]);
    // A failed defaults read keeps the row's own value (the pre-resolver answer).
    if (!loaded.ok) {
      return {
        cancellationHours: row.cancellation_hours ?? null,
        depositPct: row.deposit_pct ?? null,
        talentProfileId: row.talent_profile_id,
      };
    }
    sellingDefaults = loaded.defaults.get(row.talent_profile_id) ?? {};
  }
  const effective = resolveOfferingPolicy(
    {
      reserveMode: row.reserve_mode,
      depositPct: row.deposit_pct,
      cancellationHours: row.cancellation_hours,
    },
    sellingDefaults,
  );
  return {
    cancellationHours: effective.cancellationHours,
    depositPct: effective.depositPct,
    talentProfileId: row.talent_profile_id,
  };
}

/**
 * The cancellation window this offering was sold under: offering value, then
 * the talent default, then the platform 24 h. Null on a read failure or for a
 * flexible agency offering; callers treat null as "no window", as before.
 */
export async function loadEffectiveCancellationHours(
  db: SupabaseClient,
  offeringId: string,
): Promise<number | null> {
  return (await loadEffectiveBookingPolicy(db, offeringId))?.cancellationHours ?? null;
}
