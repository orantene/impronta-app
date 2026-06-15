/**
 * Multi-Language Platform — WS2: talent-tier locale preference resolver.
 *
 * Plan: web/docs/multi-language-platform-execution-plan-2026-06-15.md (R1).
 *
 * A talent may self-select a preferred language (`talent_profiles.preferred_locale`).
 * Per R1 this OVERRIDES the agency default for the talent's OWN surfaces:
 *   - their back-end dashboard, and
 *   - the default language of their public talent page,
 * but is always **constrained to the agency's supported set**. If the talent's
 * preference isn't one of the agency's supported locales (e.g. the agency
 * dropped that language), we fall back to the agency default — the talent is
 * never shown a language the agency doesn't publish.
 *
 * `preferred_locale = NULL` ⇒ inherit the agency default (the common case).
 *
 * The pure resolver (`resolveTalentLocale`) takes already-loaded
 * `TenantLocaleSettings`; the async helper (`loadTalentEffectiveLocale`) does
 * the DB reads. Mirrors the storefront-locale composer split.
 */

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import {
  loadTenantLocaleSettings,
  type TenantLocaleSettings,
} from "./locale-resolver";

export interface TalentLocaleResolution {
  /** The locale the talent's own surfaces should render in. */
  locale: Locale;
  /**
   * True when the talent's stored preference was honored (set AND within the
   * agency's supported set). False when we fell back to the agency default —
   * either no preference, or a preference the agency no longer supports.
   */
  isPreferred: boolean;
}

/**
 * Pure resolver. Effective talent locale =
 *   preferred IF (preferred set AND preferred ∈ settings.supportedLocales)
 *   ELSE settings.defaultLocale.
 */
export function resolveTalentLocale(
  settings: TenantLocaleSettings,
  preferredLocale: string | null | undefined,
): TalentLocaleResolution {
  if (
    isLocale(preferredLocale) &&
    settings.supportedLocales.includes(preferredLocale)
  ) {
    return { locale: preferredLocale, isPreferred: true };
  }
  return { locale: settings.defaultLocale, isPreferred: false };
}

/**
 * Async helper — loads the tenant's locale settings + the talent's stored
 * preference, then resolves. Safe to call from RSC / server actions; never
 * throws on a missing column or unreachable DB (degrades to the agency
 * default for that tenant).
 *
 * `tenantId` is the agency the talent's surface is being rendered *for*
 * (a talent may be rostered to several agencies; the caller picks which
 * tenant's supported set bounds the preference — typically the primary
 * agency for the dashboard, or the agency owning the public page).
 */
export async function loadTalentEffectiveLocale(
  talentProfileId: string,
  tenantId: string,
): Promise<TalentLocaleResolution> {
  const settings = await loadTenantLocaleSettings(tenantId);
  if (!talentProfileId) {
    return { locale: settings.defaultLocale, isPreferred: false };
  }

  const preferred = await loadTalentPreferredLocale(talentProfileId);
  return resolveTalentLocale(settings, preferred);
}

/**
 * Raw read of `talent_profiles.preferred_locale`. Returns `null` when unset,
 * the column is absent (pre-migration), or the DB is unreachable.
 */
export async function loadTalentPreferredLocale(
  talentProfileId: string,
): Promise<Locale | null> {
  if (!talentProfileId) return null;

  const supabase = createPublicSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("talent_profiles")
    .select("preferred_locale")
    .eq("id", talentProfileId)
    .maybeSingle<{ preferred_locale: string | null }>();

  if (error) {
    if (!isPostgrestMissingColumnError(error)) {
      logServerError("talent-locale.loadPreferred", error);
    }
    return null;
  }

  return isLocale(data?.preferred_locale) ? data.preferred_locale : null;
}
