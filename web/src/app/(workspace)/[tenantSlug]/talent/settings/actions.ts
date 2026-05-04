"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";

export type SaveContactPrefsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Upsert the talent's contact preferences for all four trust tiers.
 * Only the talent themselves (matched by user_id on their talent_profile) may
 * call this action. Agency staff managing on behalf of talent use the admin
 * contact-policy surface instead.
 */
export async function saveTalentContactPrefs(
  tenantSlug: string,
  talentProfileId: string,
  prefs: {
    allowBasic: boolean;
    allowVerified: boolean;
    allowSilver: boolean;
    allowGold: boolean;
  },
): Promise<SaveContactPrefsResult> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return { ok: false, error: "Not authenticated" };

    const scope = await getTenantScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Tenant not found" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    // Verify this user owns the talent profile
    const { data: tp, error: tpErr } = await supabase
      .from("talent_profiles")
      .select("id, user_id")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (tpErr || !tp) {
      logServerError("talent.saveContactPrefs.verify", tpErr);
      return { ok: false, error: "Profile not found" };
    }

    if (tp.user_id !== session.user.id) {
      return { ok: false, error: "Forbidden" };
    }

    const { error } = await supabase
      .from("talent_contact_preferences")
      .upsert(
        {
          talent_profile_id: talentProfileId,
          tenant_id: scope.tenantId,
          allow_basic: prefs.allowBasic,
          allow_verified: prefs.allowVerified,
          allow_silver: prefs.allowSilver,
          allow_gold: prefs.allowGold,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "talent_profile_id" },
      );

    if (error) {
      logServerError("talent.saveContactPrefs.upsert", error);
      return { ok: false, error: "Failed to save preferences" };
    }

    revalidatePath(`/${tenantSlug}/talent/settings`);
    return { ok: true };
  } catch (err) {
    logServerError("talent.saveContactPrefs", err);
    return { ok: false, error: "Unexpected error" };
  }
}
