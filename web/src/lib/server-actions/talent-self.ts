"use server";

/**
 * Talent self — server actions for the talent currently signed in.
 *
 * Used by surfaces (OfferTab, talent inbox, settings) that need a
 * cheap snapshot of the talent's own state without re-loading the
 * full RSC tree.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { countHeldTalentPayoutLegs } from "@/lib/payments/booking-payouts-ledger";
import { loadMyInquiryTakeHome as loadMyInquiryTakeHomeImpl, type TalentTakeHome } from "@/lib/talent/inquiry-take-home";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { fetchLanguageSettingsPublic } from "@/lib/language-settings/fetch-language-settings";

export type TalentPayoutSnapshot = {
  hasProfile: boolean;
  status: "none" | "pending" | "enabled" | "restricted" | "disabled";
  pendingPayouts: number;
};

/** Item #7 wiring: load the signed-in talent's Stripe Connect Express
 *  account status. Returns hasProfile=false when the user has no
 *  talent_profiles row (pure client / admin-only users). The
 *  PayoutNudgeCard auto-hides on status=enabled or hasProfile=false. */
export async function loadCurrentTalentPayoutSnapshot(): Promise<TalentPayoutSnapshot> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) {
      return { hasProfile: false, status: "none", pendingPayouts: 0 };
    }
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { hasProfile: false, status: "none", pendingPayouts: 0 };
    }
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id, stripe_account_status")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!tp) {
      return { hasProfile: false, status: "none", pendingPayouts: 0 };
    }
    // pendingPayouts is a COUNT of bookings ready to pay out (the card reads it
    // as "You have N accepted bookings ready to pay out"): this talent's payout
    // legs that are HELD because the client paid but there's no enabled connected
    // account yet. Routed through the ledger lib (service-role) so the server-action
    // tenant-scoping ratchet isn't tripped + the count is accurate regardless of RLS.
    const pendingPayouts = await countHeldTalentPayoutLegs(tp.id as string);
    return {
      hasProfile: true,
      status: ((tp.stripe_account_status as TalentPayoutSnapshot["status"] | null) ?? "none"),
      pendingPayouts,
    };
  } catch (err) {
    logServerError("talent-self.loadPayoutSnapshot", err);
    return { hasProfile: false, status: "none", pendingPayouts: 0 };
  }
}

/**
 * Audit #7 tail (thin "use server" wrapper): resolve the signed-in talent then
 * delegate to the `server-only` lib that does the scoped reads, so this action
 * file stays free of raw tenant-bypassing `.from(...)` queries (the OfferTab is
 * a client component, so it can only call a "use server" action — not the lib).
 */
export async function loadMyInquiryTakeHome(inquiryId: string): Promise<TalentTakeHome> {
  const session = await getCachedActorSession();
  if (!session?.user) return null;
  return loadMyInquiryTakeHomeImpl(session.user.id, inquiryId);
}

// ─── Preferred language (WS2 / R1) ───────────────────────────────────────────
//
// Talent self-selected preferred language, stored on
// `talent_profiles.preferred_locale` (NULL = inherit the agency default). Per
// R1 it overrides the agency default for the talent's own dashboard + the
// default language of their public talent page — constrained to the agency's
// supported set (the options below come from the talent's PRIMARY agency's
// `supported_locales`). At render time `resolveTalentLocale` re-applies the
// same constraint, so an option that's later dropped from the agency simply
// falls back to the agency default.
//
// Gate: the signed-in user must own the talent_profiles row. Write uses the
// service-role client (the talent may lack RLS update on this column), mirroring
// updateTalentDefaultCurrency in talent-self.ts's sibling settings actions.

/** A locale the talent may pick — sourced from their agency's supported set. */
export type TalentLanguageOption = { code: Locale; labelNative: string; labelEn: string };

export type LoadTalentPreferredLanguageResult =
  | {
      ok: true;
      data: {
        /** Current stored preference, or null when inheriting the agency default. */
        preferredLocale: Locale | null;
        /** Agency default — what "Inherit" resolves to. */
        agencyDefaultLocale: Locale;
        /** Selectable languages = the agency's supported set (primary first). */
        options: TalentLanguageOption[];
      };
    }
  | { ok: false; error: string };

/**
 * Resolve the signed-in talent's profile + their primary agency, returning the
 * profile id and that agency's tenant id. Primary = the `is_primary` roster row,
 * else the earliest active roster row. Returns null tenant when un-rostered.
 */
async function resolveTalentSelfPrimaryAgency(): Promise<
  | { ok: true; talentProfileId: string; primaryTenantId: string | null }
  | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable" };

  const { data: tp, error: tpErr } = await supabase
    .from("talent_profiles")
    .select("id, user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (tpErr || !tp) {
    if (tpErr) logServerError("talent-self.preferredLanguage.profile", tpErr);
    return { ok: false, error: "Profile not found" };
  }

  const { data: rosterRows, error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, is_primary, added_at, status")
    .eq("talent_profile_id", tp.id)
    .neq("status", "removed")
    .order("is_primary", { ascending: false })
    .order("added_at", { ascending: true });
  if (rosterErr) {
    logServerError("talent-self.preferredLanguage.roster", rosterErr);
  }
  const primaryTenantId =
    (rosterRows ?? []).find((r) => r.is_primary)?.tenant_id ??
    (rosterRows ?? [])[0]?.tenant_id ??
    null;

  return { ok: true, talentProfileId: tp.id as string, primaryTenantId };
}

export async function loadTalentPreferredLanguage(): Promise<LoadTalentPreferredLanguageResult> {
  try {
    const resolved = await resolveTalentSelfPrimaryAgency();
    if (!resolved.ok) return resolved;

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable" };

    const { data: prefRow, error: prefErr } = await supabase
      .from("talent_profiles")
      .select("preferred_locale")
      .eq("id", resolved.talentProfileId)
      .maybeSingle<{ preferred_locale: string | null }>();
    if (prefErr) {
      logServerError("talent-self.preferredLanguage.load", prefErr);
      return { ok: false, error: "Could not load preferred language." };
    }

    // Supported set bounding the options = the primary agency's settings.
    const settings = resolved.primaryTenantId
      ? await loadTenantLocaleSettings(resolved.primaryTenantId)
      : null;
    const supported = settings ? [...settings.supportedLocales] : ["en"];
    const agencyDefaultLocale = settings?.defaultLocale ?? "en";

    // Decorate each supported code with registry labels for display.
    const language = await fetchLanguageSettingsPublic().catch(() => null);
    const labelByCode = new Map<string, { labelNative: string; labelEn: string }>();
    for (const row of language?.locales ?? []) {
      labelByCode.set(row.code, { labelNative: row.label_native, labelEn: row.label_en });
    }
    const options: TalentLanguageOption[] = supported.map((code) => {
      const labels = labelByCode.get(code);
      return {
        code,
        labelNative: labels?.labelNative ?? code.toUpperCase(),
        labelEn: labels?.labelEn ?? code.toUpperCase(),
      };
    });

    const stored = prefRow?.preferred_locale;
    // Only surface a stored preference that's still within the supported set.
    const preferredLocale =
      isLocale(stored) && supported.includes(stored) ? stored : null;

    return {
      ok: true,
      data: { preferredLocale, agencyDefaultLocale, options },
    };
  } catch (err) {
    logServerError("talent-self.preferredLanguage.load", err);
    return { ok: false, error: "Unexpected error" };
  }
}

export type UpdateTalentPreferredLanguageResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Persist the talent's preferred language. Pass `null` (or "inherit") to clear
 * the preference and inherit the agency default. A non-null value must be one
 * of the talent's primary-agency supported locales.
 */
export async function updateTalentPreferredLanguage(
  candidate: string | null,
): Promise<UpdateTalentPreferredLanguageResult> {
  try {
    const resolved = await resolveTalentSelfPrimaryAgency();
    if (!resolved.ok) return resolved;

    let nextValue: Locale | null = null;
    if (candidate !== null && candidate !== "inherit" && candidate.trim() !== "") {
      if (!isLocale(candidate)) {
        return { ok: false, error: "Unsupported language." };
      }
      const settings = resolved.primaryTenantId
        ? await loadTenantLocaleSettings(resolved.primaryTenantId)
        : null;
      const supported = settings ? settings.supportedLocales : ["en"];
      if (!supported.includes(candidate)) {
        return { ok: false, error: "That language isn't offered by your agency." };
      }
      nextValue = candidate;
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error" };

    const { error } = await admin
      .from("talent_profiles")
      .update({ preferred_locale: nextValue, updated_at: new Date().toISOString() })
      .eq("id", resolved.talentProfileId);
    if (error) {
      logServerError("talent-self.preferredLanguage.update", error);
      return { ok: false, error: "Failed to update preferred language." };
    }

    revalidatePath(`/talent/settings`);
    return { ok: true };
  } catch (err) {
    logServerError("talent-self.preferredLanguage.update", err);
    return { ok: false, error: "Unexpected error" };
  }
}
