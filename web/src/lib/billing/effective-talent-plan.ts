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

/** Batch resolve: profile id -> effective plan key (always has an entry per input). */
export async function resolveEffectiveTalentPlans(
  db: Db,
  rows: readonly TalentPlanInput[],
  now: Date = new Date(),
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const r of rows) out.set(r.id, r.talent_plan_key);
  if (rows.length === 0) return out;
  try {
    const { data, error } = await db
      .from("talent_subscriptions")
      .select("talent_profile_id, status, past_due_since")
      .in("talent_profile_id", rows.map((r) => r.id))
      .eq("status", "past_due");
    if (error || !data) return out;
    const byProfile = new Map<string, { status: string; pastDueSince: string | null }>();
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
    for (const r of rows) {
      const billing = byProfile.get(r.id);
      if (billing) out.set(r.id, effectiveEntitlementPlan(r.talent_plan_key, billing, now));
    }
  } catch {
    // fail open
  }
  return out;
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
