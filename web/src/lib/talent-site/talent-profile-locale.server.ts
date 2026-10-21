import "server-only";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { getRequestLocale } from "@/i18n/request-locale";
import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
import { loadTalentLocaleState } from "@/lib/site-admin/server/talent-locale-settings";
import {
  applyLangQuery,
  decideTalentProfileLocale,
  talentProfileSupportedSet,
  ogLocale,
  talentProfileAlternates,
  type TalentProfileLocale,
} from "./talent-profile-locale";

/** The locale a public talent profile renders in, bounded to the talent's set. */
export async function resolveTalentProfileLocale(
  profileId: string,
  langQuery?: string | string[] | null,
): Promise<TalentProfileLocale> {
  const [requested, state, language] = await Promise.all([
    getRequestLocale(),
    loadTalentLocaleState(profileId),
    getLanguageSettingsPublicCached().catch(() => null),
  ]);
  const { settings } = state;
  return decideTalentProfileLocale({
    requested: applyLangQuery(requested, langQuery),
    primary: settings.defaultLocale,
    supported: talentProfileSupportedSet({
      unset: state.seedPrimary === null && settings.secondaryLocales.length === 0,
      supported: settings.supportedLocales,
      publicLocales: language?.publicLocales ?? [],
    }),
  });
}

/**
 * Metadata language bits for `/t/<code>`: canonical + hreflang on the app
 * host (platform URL grammar), bounded to the talent's languages.
 */
export async function talentProfileLocaleMetadata(input: {
  profileId: string;
  profileCode: string;
  /** Absolute app-host URL of `/t/<code>`, or null when unresolvable. */
  canonicalAbsolute: string | null;
  fallbackOrigin: string;
  /** `?lang=` of the request: head and body must resolve the same locale (TUL-855). */
  langQuery?: string | string[] | null;
}) {
  const [profile, language] = await Promise.all([
    resolveTalentProfileLocale(input.profileId, input.langQuery),
    getLanguageSettingsPublicCached().catch(() => null),
  ]);
  const origin = new URL(input.canonicalAbsolute ?? input.fallbackOrigin).origin;
  const alternates = talentProfileAlternates({
    origin,
    path: `/t/${encodeURIComponent(input.profileCode)}`,
    urlDefault: language?.defaultLocale ?? DEFAULT_PLATFORM_LOCALE,
    profile,
  });
  return {
    profile,
    alternates,
    openGraphLocale: ogLocale(profile.locale),
    openGraphAlternateLocale: profile.supported.filter((l) => l !== profile.locale).map(ogLocale),
  };
}

/**
 * TUL-875: same decision as `resolveTalentProfileLocale`, keyed by profile
 * code, for the root layout (<html lang>). Null when the talent cannot be
 * read publicly (unknown/hidden/preview) so the caller keeps the request
 * locale. Never throws.
 */
export async function resolveTalentProfileLocaleByCode(
  profileCode: string,
  langQuery?: string | string[] | null,
): Promise<TalentProfileLocale | null> {
  try {
    const pub = createPublicSupabaseClient();
    if (!pub) return null;
    const { data } = await pub
      .from("talent_profiles")
      .select("id")
      .eq("profile_code", profileCode)
      .maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    return id ? await resolveTalentProfileLocale(id, langQuery) : null;
  } catch {
    return null;
  }
}
