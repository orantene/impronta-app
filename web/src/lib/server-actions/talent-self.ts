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
import { loadOwnTalentProfileId, writeTalentLanguages } from "@/lib/talent/talent-languages-store";
import { countHeldTalentPayoutLegs } from "@/lib/payments/booking-payouts-ledger";
import { loadMyInquiryTakeHome as loadMyInquiryTakeHomeImpl, type TalentTakeHome } from "@/lib/talent/inquiry-take-home";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { fetchLanguageSettingsPublic } from "@/lib/language-settings/fetch-language-settings";
import {
  invalidateTalentLocaleSettings,
  loadTalentLocaleRow,
  normalizeTalentLocalePair,
} from "@/lib/site-admin/server/talent-locale-settings";

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
 * the preference and follow the platform default. A non-null value must be a
 * platform public locale (talent-owned languages, 2026-09-29).
 */
export async function updateTalentPreferredLanguage(
  candidate: string | null,
): Promise<UpdateTalentPreferredLanguageResult> {
  // 2026-09-29: delegates to `updateTalentLanguages`, keeping the talent's
  // current secondary languages. Now bounded to PLATFORM public locales (not
  // the agency's), matching the talent-owned language model.
  const primary =
    candidate === null || candidate === "inherit" || candidate.trim() === "" ? null : candidate;
  const current = await loadTalentLanguages();
  const secondary = current.ok ? current.data.secondary.filter((l) => l !== primary) : [];
  return updateTalentLanguages({ primary, secondary });
}

// ─── Talent languages (primary + secondary), 2026-09-29 ──────────────────────
//
// Talent-owned: bounded to the PLATFORM public locale set, never an agency's.
// primary = `preferred_locale` (null = platform default); secondary =
// `secondary_locales` (never includes primary). Owner-only: the signed-in
// user's own talent_profiles row.

export type TalentLanguagesData = {
  /** Stored primary, or null when following the platform default. */
  storedPrimary: Locale | null;
  /** Effective primary (stored primary if public, else platform default). */
  primary: Locale;
  secondary: Locale[];
  platformDefaultLocale: Locale;
  /** Every language the talent may pick (platform public locales). */
  options: TalentLanguageOption[];
};

export type LoadTalentLanguagesResult =
  | { ok: true; data: TalentLanguagesData }
  | { ok: false; error: string };

export type UpdateTalentLanguagesInput = {
  primary: string | null;
  secondary: readonly string[];
};

export type UpdateTalentLanguagesResult =
  | { ok: true; data: { primary: Locale; secondary: Locale[] } }
  | { ok: false; error: string };

async function resolveTalentSelfProfileId(): Promise<
  { ok: true; talentProfileId: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  const talentProfileId = await loadOwnTalentProfileId(session.user.id);
  if (!talentProfileId) return { ok: false, error: "Profile not found" };
  return { ok: true, talentProfileId };
}

async function loadPlatformLanguageOptions(): Promise<{
  publicLocales: string[];
  platformDefault: Locale;
  options: TalentLanguageOption[];
}> {
  const language = await fetchLanguageSettingsPublic().catch(() => null);
  const publicLocales = language?.publicLocales?.length ? language.publicLocales : ["en"];
  const labelByCode = new Map<string, { labelNative: string; labelEn: string }>();
  for (const row of language?.locales ?? []) {
    labelByCode.set(row.code, { labelNative: row.label_native, labelEn: row.label_en });
  }
  const options = publicLocales.map((code) => ({
    code,
    labelNative: labelByCode.get(code)?.labelNative ?? code.toUpperCase(),
    labelEn: labelByCode.get(code)?.labelEn ?? code.toUpperCase(),
  }));
  return { publicLocales, platformDefault: language?.defaultLocale ?? "en", options };
}

export async function loadTalentLanguages(): Promise<LoadTalentLanguagesResult> {
  try {
    const who = await resolveTalentSelfProfileId();
    if (!who.ok) return who;
    const [row, platform] = await Promise.all([
      loadTalentLocaleRow(who.talentProfileId),
      loadPlatformLanguageOptions(),
    ]);
    const pair = normalizeTalentLocalePair(
      row?.preferred_locale ?? null,
      row?.secondary_locales ?? [],
      platform.publicLocales,
      platform.platformDefault,
    );
    const stored = row?.preferred_locale;
    return {
      ok: true,
      data: {
        storedPrimary: isLocale(stored) && platform.publicLocales.includes(stored) ? stored : null,
        primary: pair.primary,
        secondary: [...pair.secondary],
        platformDefaultLocale: platform.platformDefault,
        options: platform.options,
      },
    };
  } catch (err) {
    logServerError("talent-self.languages.load", err);
    return { ok: false, error: "Unexpected error" };
  }
}

export async function updateTalentLanguages(
  input: UpdateTalentLanguagesInput,
): Promise<UpdateTalentLanguagesResult> {
  try {
    const who = await resolveTalentSelfProfileId();
    if (!who.ok) return who;
    const platform = await loadPlatformLanguageOptions();

    const rawPrimary = input.primary?.trim() ? input.primary.trim() : null;
    if (rawPrimary !== null && (!isLocale(rawPrimary) || !platform.publicLocales.includes(rawPrimary))) {
      return { ok: false, error: "Unsupported language." };
    }
    for (const code of input.secondary ?? []) {
      if (!isLocale(code) || !platform.publicLocales.includes(code)) {
        return { ok: false, error: "Unsupported language." };
      }
    }
    const pair = normalizeTalentLocalePair(
      rawPrimary,
      input.secondary ?? [],
      platform.publicLocales,
      platform.platformDefault,
    );
    const secondary = [...pair.secondary];

    const saved = await writeTalentLanguages(who.talentProfileId, rawPrimary, secondary);
    if (!saved) return { ok: false, error: "Failed to update languages." };

    invalidateTalentLocaleSettings(who.talentProfileId);
    revalidatePath("/talent", "layout");
    return { ok: true, data: { primary: pair.primary, secondary } };
  } catch (err) {
    logServerError("talent-self.languages.update", err);
    return { ok: false, error: "Unexpected error" };
  }
}
