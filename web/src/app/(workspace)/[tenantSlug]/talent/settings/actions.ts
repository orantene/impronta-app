"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import {
  DEFAULT_CURRENCY_FALLBACK,
  normalizeDefaultCurrency,
  resolveDefaultCurrencyForUI,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { logServerError } from "@/lib/server/safe-error";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";

export type SaveContactPrefsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Talent self-service global visibility switch.
 *
 * `hidden = true`  → talent_profiles.is_publicly_hidden = true. The talent
 * disappears from every directory, agency site and public page across all of
 * Tulala — this overrides any agency's per-roster `agency_visibility` eye.
 * `hidden = false` → the talent is publicly visible again wherever an agency
 * has them site-visible.
 *
 * Only the talent themselves (matched by `user_id` on their talent_profile)
 * may call this.
 */
export async function setTalentProfileVisibility(
  tenantSlug: string,
  talentProfileId: string,
  hidden: boolean,
): Promise<SaveContactPrefsResult> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return { ok: false, error: "Not authenticated" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    // Verify this user owns the talent profile.
    const { data: tp, error: tpErr } = await supabase
      .from("talent_profiles")
      .select("id, user_id")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (tpErr || !tp) {
      logServerError("talent.setProfileVisibility.verify", tpErr);
      return { ok: false, error: "Profile not found" };
    }
    if (tp.user_id !== session.user.id) {
      return { ok: false, error: "Forbidden" };
    }

    const { error } = await supabase
      .from("talent_profiles")
      .update({ is_publicly_hidden: hidden, updated_at: new Date().toISOString() })
      .eq("id", talentProfileId);

    if (error) {
      logServerError("talent.setProfileVisibility.update", error);
      return { ok: false, error: "Failed to update visibility" };
    }

    revalidatePath(`/${tenantSlug}/talent/settings`);
    revalidateDirectoryListing();
    return { ok: true };
  } catch (err) {
    logServerError("talent.setProfileVisibility", err);
    return { ok: false, error: "Unexpected error" };
  }
}

/**
 * Talent per-agency-site visibility switch.
 *
 * `hidden = true`  → agency_talent_roster.talent_site_hidden = true for this
 * (tenant, talent) row. The talent opts out of THAT agency's public site only;
 * other agencies and the global switch are untouched.
 * `hidden = false` → the talent appears on that agency's site again (subject to
 * the agency's own eye and the talent's global switch).
 *
 * The talent has no RLS write access to agency_talent_roster, so the write
 * elevates to the service-role client after verifying profile ownership —
 * scoped to the verified (tenant, talent) row.
 */
export async function setTalentSiteVisibility(
  tenantSlug: string,
  talentProfileId: string,
  agencyTenantId: string,
  hidden: boolean,
): Promise<SaveContactPrefsResult> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return { ok: false, error: "Not authenticated" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    // Verify this user owns the talent profile (RLS-bound read).
    const { data: tp, error: tpErr } = await supabase
      .from("talent_profiles")
      .select("id, user_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (tpErr || !tp) {
      logServerError("talent.setSiteVisibility.verify", tpErr);
      return { ok: false, error: "Profile not found" };
    }
    if (tp.user_id !== session.user.id) {
      return { ok: false, error: "Forbidden" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error" };

    const { error } = await admin
      .from("agency_talent_roster")
      .update({ talent_site_hidden: hidden })
      .eq("tenant_id", agencyTenantId)
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "removed");

    if (error) {
      logServerError("talent.setSiteVisibility.update", error);
      return { ok: false, error: "Failed to update visibility" };
    }

    revalidatePath(`/${tenantSlug}/talent/settings`);
    revalidateDirectoryListing();
    return { ok: true };
  } catch (err) {
    logServerError("talent.setSiteVisibility", err);
    return { ok: false, error: "Unexpected error" };
  }
}

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

// ─── Default currency (PR-E foundation · decision-log L49) ────────────────────
//
// Talent-owned `talent_profiles.default_currency` — decides which currency
// tab opens first on the talent Money surface when multi-currency data
// starts flowing. Display-only; the underlying snapshot rows are EUR-only
// at v1.
//
// Gated by `requireTalentSelf()` (ownership-by-`user_id` on
// `talent_profiles`). DB write uses the service-role client because the
// talent may not have RLS update access to every column.
//
// NB: `talent_profiles.user_id` is the correct column name (NOT
// `owner_user_id`). See backlog item #6.

export type LoadTalentDefaultCurrencyResult =
  | { ok: true; data: { defaultCurrency: DefaultCurrencyCode } }
  | { ok: false; error: string };

export async function loadTalentDefaultCurrency(): Promise<LoadTalentDefaultCurrencyResult> {
  try {
    const guard = await requireTalentSelf();
    if (!guard.ok) return { ok: false, error: guard.error };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const { data, error } = await supabase
      .from("talent_profiles")
      .select("default_currency")
      .eq("id", guard.talentProfile.id)
      .maybeSingle();

    if (error) {
      logServerError("talent.loadDefaultCurrency", error);
      return { ok: false, error: "Could not load default currency." };
    }

    return {
      ok: true,
      data: {
        defaultCurrency: resolveDefaultCurrencyForUI(
          (data as { default_currency?: string } | null)?.default_currency
            ?? DEFAULT_CURRENCY_FALLBACK,
        ),
      },
    };
  } catch (err) {
    logServerError("talent.loadDefaultCurrency", err);
    return { ok: false, error: "Unexpected error" };
  }
}

export type UpdateTalentDefaultCurrencyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateTalentDefaultCurrency(
  candidate: string,
): Promise<UpdateTalentDefaultCurrencyResult> {
  try {
    const normalized = normalizeDefaultCurrency(candidate);
    if (!normalized) return { ok: false, error: "Unsupported currency." };

    const guard = await requireTalentSelf();
    if (!guard.ok) return { ok: false, error: guard.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error" };

    const { error } = await admin
      .from("talent_profiles")
      .update({
        default_currency: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guard.talentProfile.id);

    if (error) {
      logServerError("talent.updateDefaultCurrency", error);
      return { ok: false, error: "Failed to update default currency." };
    }

    revalidatePath(`/talent/settings`);
    return { ok: true };
  } catch (err) {
    logServerError("talent.updateDefaultCurrency", err);
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
