"use server";

import { isTalentWebsiteSettingsEnabled } from "@/lib/access/talent-website-settings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";

/**
 * Server-side flag check for the signed-in talent. Flag off → false.
 * Booking settings apply to every talent (website and Tulala profile), so this
 * checks the talent only, never a website plan capability.
 */
export async function loadWebsiteSettingsEnabledAction(): Promise<boolean> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return false;
  return isTalentWebsiteSettingsEnabled(scope.talentProfile.id);
}

/**
 * `talent_booking_hours.min_notice_min` for the signed-in talent (read only).
 * The screen resolves the effective notice with `resolveEffectiveMinNoticeMin`,
 * the same overlay the instant-purchase path uses. null when absent.
 */
export async function loadHoursMinNoticeAction(): Promise<number | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  if (!isTalentWebsiteSettingsEnabled(scope.talentProfile.id)) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_booking_hours")
    .select("min_notice_min")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();
  if (error) {
    logServerError("talent.websiteSettings.hoursNotice", error);
    return null;
  }
  const v = (data as { min_notice_min?: unknown } | null)?.min_notice_min;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : null;
}
