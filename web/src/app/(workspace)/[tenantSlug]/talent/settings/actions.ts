"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
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

    const scope = await getTenantPortalScopeBySlug(tenantSlug);
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

function backToTalentSettings(tenantSlug: string, params: URLSearchParams): never {
  redirect(`/${tenantSlug}/talent/settings?${params.toString()}`);
}

export async function connectTalentPayoutAccountAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const talentProfileId = String(formData.get("talentProfileId") ?? "");

  const session = await getCachedActorSession();
  if (!session.user) {
    const p = new URLSearchParams({ payerr: "Not authenticated." });
    backToTalentSettings(tenantSlug, p);
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    const p = new URLSearchParams({ payerr: "Workspace not found." });
    backToTalentSettings(tenantSlug, p);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const p = new URLSearchParams({ payerr: "Database unavailable." });
    backToTalentSettings(tenantSlug, p);
  }

  const { data: profile, error: profileError } = await supabase
    .from("talent_profiles")
    .select("id, user_id, display_name")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (profileError || !profile || profile.user_id !== session.user.id) {
    if (profileError) logServerError("talent.connectPayout.verifyProfile", profileError);
    const p = new URLSearchParams({ payerr: "Forbidden." });
    backToTalentSettings(tenantSlug, p);
  }

  const { data: roster, error: rosterError } = await supabase
    .from("agency_talent_roster")
    .select("id, status")
    .eq("tenant_id", scope.tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();

  if (rosterError || !roster) {
    if (rosterError) logServerError("talent.connectPayout.verifyRoster", rosterError);
    const p = new URLSearchParams({ payerr: "You are not rostered in this workspace." });
    backToTalentSettings(tenantSlug, p);
  }

  const { data: existing, error: existingError } = await supabase
    .from("payout_accounts")
    .select("id")
    .eq("tenant_id", scope.tenantId)
    .eq("owner_type", "talent")
    .eq("owner_id", talentProfileId)
    .in("status", ["pending_verification", "connected"])
    .maybeSingle();

  if (existingError) {
    logServerError("talent.connectPayout.lookup", existingError);
  }

  if (!existing) {
    const displayName =
      profile.display_name?.trim() || session.user.email || "Talent payout account";
    const { error } = await supabase.from("payout_accounts").insert({
      tenant_id: scope.tenantId,
      owner_type: "talent",
      owner_id: talentProfileId,
      display_name: displayName,
      provider: "manual_bank",
      status: "connected",
      connected_at: new Date().toISOString(),
    });
    if (error) {
      logServerError("talent.connectPayout.insert", error);
      const p = new URLSearchParams({ payerr: "Failed to connect payout account." });
      backToTalentSettings(tenantSlug, p);
    }
  }

  revalidatePath(`/${tenantSlug}/talent/settings`);
  const p = new URLSearchParams({
    paymsg: existing ? "Payout account already connected." : "Payout account connected.",
  });
  backToTalentSettings(tenantSlug, p);
}
