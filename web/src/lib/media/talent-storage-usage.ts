/**
 * talent-storage-usage.ts — the live half of the talent media count quota.
 *
 * `lib/billing/media-entitlements.ts` decides IF a count is over the cap; this
 * module is the only thing that reads WHAT the count currently is. Splitting
 * them keeps the entitlements module pure (no Supabase, testable with plain
 * numbers) while giving every upload entry point one import to gate on.
 *
 * WHAT COUNTS
 * ───────────
 * Every live `media_assets` row the talent owns: `owner_talent_profile_id = $1
 * AND deleted_at IS NULL`. Deliberately NOT filtered by `purpose` or
 * `variant_kind` — the talent-owned insert sites across the codebase do not set
 * `purpose` consistently, so filtering on it would undercount and let the cap
 * be walked past through whichever entry point happens to omit the column.
 * This unfiltered definition is also the one the pricing pass measured against
 * (`web/docs/media-pricing-pass-2026-08-15.md` §2): it reproduces the doc's
 * numbers exactly, max 108 photos and zero talents over the 150 cap.
 *
 * NO CACHING, on purpose. The count has to be read-after-write correct or two
 * uploads in the same render can both see the pre-upload number and both pass
 * a cap they jointly break. See `incident_next_fetch_memoization_render_writes`.
 *
 * Cheap: `idx_media_assets_owner` is already a partial btree on
 * `owner_talent_profile_id WHERE deleted_at IS NULL`. No migration needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkTalentAssetCountAllowance,
  normalizeTalentMediaPlanKey,
  talentMediaStorageQuota,
  type AssetCountVerdict,
  type TalentMediaPlanKey,
} from "@/lib/billing/media-entitlements";

/**
 * What a surface needs to say "N of M photos" BEFORE anyone hits the wall
 * (execution-plan-2026-08-15 §3 B13).
 *
 * `cap === null` is Portfolio (or an unknown plan key degrading to it) and MUST
 * render as "no limit" — never as a fraction with a null denominator.
 */
export type TalentMediaUsage = {
  used: number;
  /** null = unmetered. Read from MEDIA_ENTITLEMENT_CONFIG, never invented. */
  cap: number | null;
  /** null when `cap` is null. Never negative: someone already over keeps it. */
  remaining: number | null;
};

/**
 * Live count of media assets a talent owns. Returns null when the query fails,
 * which callers MUST treat as "unknown, do not block" — a transient Supabase
 * error must never present as a quota refusal to a talent who is under cap.
 */
export async function countLiveTalentAssets(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null);
  if (error) return null;
  return count ?? 0;
}

/** The talent's plan key, degrading to the permissive entry when unreadable. */
export async function readTalentMediaPlanKey(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<TalentMediaPlanKey> {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("talent_plan_key")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return normalizeTalentMediaPlanKey(null);
  return normalizeTalentMediaPlanKey((data as { talent_plan_key: unknown }).talent_plan_key);
}

/**
 * THE read behind every "N of M photos" line (B13).
 *
 * Until this existed the cap was invisible until it refused an upload, and the
 * only warning anywhere fired at 80% AFTER a successful upload, on one surface.
 * A quota nobody can see is indistinguishable from a bug when it finally bites.
 *
 * ONE COUNT PER CALL, deliberately: the same two round trips the upload gate
 * already makes (`checkTalentUploadQuota`), and never per tile. Callers hand
 * the result down; nothing re-reads it per asset.
 *
 * Returns null when the count read fails — callers render NOTHING rather than
 * a made-up number. Showing "0 of 150" to a talent with 90 photos would be
 * worse than showing no line at all.
 */
export async function readTalentMediaUsage(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<TalentMediaUsage | null> {
  const used = await countLiveTalentAssets(supabase, talentProfileId);
  if (used === null) return null;
  const planKey = await readTalentMediaPlanKey(supabase, talentProfileId);
  const cap = talentMediaStorageQuota(planKey).maxAssets;
  return {
    used,
    cap,
    remaining: cap === null ? null : Math.max(0, cap - used),
  };
}

/**
 * THE gate every talent-owned upload entry point calls before its
 * `media_assets` insert. One round trip for the count, one for the plan key.
 *
 * FAILS OPEN by design. If either read errors we return an allowing verdict
 * rather than a refusal: the caps are an abuse backstop that no current talent
 * can reach (doc §3a), so wrongly blocking a real upload during a Supabase
 * blip is strictly worse than wrongly allowing one photo past a cap.
 */
export async function checkTalentUploadQuota(input: {
  supabase: SupabaseClient;
  talentProfileId: string;
  /** How many rows this operation is about to insert. Bulk paths pass > 1. */
  incomingAssets: number;
}): Promise<AssetCountVerdict> {
  const used = await countLiveTalentAssets(input.supabase, input.talentProfileId);
  if (used === null) {
    return { allowed: true, remainingAssets: null, warn: false, message: "", code: "ok" };
  }
  const planKey = await readTalentMediaPlanKey(input.supabase, input.talentProfileId);
  return checkTalentAssetCountAllowance({
    planKey,
    usedAssets: used,
    incomingAssets: input.incomingAssets,
  });
}
