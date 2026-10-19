/**
 * lib/billing/effective-talent-plan.ts (TUL-835)
 *
 * THE choke point for "which plan do this talent's gates see right now".
 * Every server read of `talent_profiles.talent_plan_key` that feeds a gate
 * (hasEntitlement, buildTalentMembershipState, talentOffersInstantBooking, ...)
 * must pass the stored key through here, so a subscription that stayed
 * past_due beyond the 7-day grace window resolves as talent_basic.
 *
 * Content is never deleted: only the returned key changes. Reads fail OPEN: if
 * the subscription lookup errors we keep the stored plan (never strip a paying
 * customer on an infra blip). No `server-only` so it is unit-testable; callers
 * pass a service-role client (talent_subscriptions is not anon-readable).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { effectiveEntitlementPlan } from "../access/talent-entitlements";

type Db = Pick<SupabaseClient, "from">;

export type TalentPlanInput = { id: string; talent_plan_key: string | null };

type PastDueRow = { status: string; pastDueSince: string | null };

/** past_due subscription rows by profile id (earliest failure wins). Null on a read error. */
async function loadPastDueByProfile(db: Db, ids: readonly string[]): Promise<Map<string, PastDueRow> | null> {
  try {
    const { data, error } = await db
      .from("talent_subscriptions")
      .select("talent_profile_id, status, past_due_since")
      .in("talent_profile_id", ids)
      .eq("status", "past_due");
    if (error || !data) return null;
    const byProfile = new Map<string, PastDueRow>();
    for (const s of data as {
      talent_profile_id: string;
      status: string;
      past_due_since: string | null;
    }[]) {
      const prev = byProfile.get(s.talent_profile_id);
      // Several past_due rows: the earliest failure wins (most conservative clock).
      if (!prev || (s.past_due_since && (!prev.pastDueSince || s.past_due_since < prev.pastDueSince))) {
        byProfile.set(s.talent_profile_id, { status: s.status, pastDueSince: s.past_due_since });
      }
    }
    return byProfile;
  } catch {
    return null;
  }
}

/** Batch resolve: profile id -> effective plan key (always has an entry per input). */
export async function resolveEffectiveTalentPlans(
  db: Db,
  rows: readonly TalentPlanInput[],
  now: Date = new Date(),
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const r of rows) out.set(r.id, r.talent_plan_key);
  if (rows.length === 0) return out;
  // Fail open: a read error keeps every stored plan.
  const byProfile = await loadPastDueByProfile(db, rows.map((r) => r.id));
  if (!byProfile) return out;
  for (const r of rows) {
    const billing = byProfile.get(r.id);
    if (billing) out.set(r.id, effectiveEntitlementPlan(r.talent_plan_key, billing, now));
  }
  return out;
}

/** What the talent past-due banner needs (TUL-835), or null when not past_due. */
export type TalentPastDueFact = { status: "past_due"; pastDueSince: string | null };

/**
 * The effective plan key PLUS the past-due fact, from the SAME single
 * talent_subscriptions read. The talent shell loader uses this so the Today
 * past-due banner costs no extra read or server action per page load.
 */
export async function resolveEffectiveTalentPlanKeyWithPastDue(
  db: Db,
  talentProfileId: string,
  storedPlanKey: string | null,
  now: Date = new Date(),
): Promise<{ planKey: string | null; pastDue: TalentPastDueFact | null }> {
  const byProfile = await loadPastDueByProfile(db, [talentProfileId]);
  const billing = byProfile?.get(talentProfileId);
  if (!billing) return { planKey: storedPlanKey, pastDue: null };
  return {
    planKey: effectiveEntitlementPlan(storedPlanKey, billing, now),
    pastDue: { status: "past_due", pastDueSince: billing.pastDueSince },
  };
}

/** Single-talent convenience over the batch resolver. */
export async function resolveEffectiveTalentPlanKey(
  db: Db,
  talentProfileId: string,
  storedPlanKey: string | null,
  now: Date = new Date(),
): Promise<string | null> {
  const m = await resolveEffectiveTalentPlans(
    db,
    [{ id: talentProfileId, talent_plan_key: storedPlanKey }],
    now,
  );
  return m.get(talentProfileId) ?? storedPlanKey;
}
