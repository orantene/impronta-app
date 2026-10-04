import "server-only";

import { getRequestLocale } from "@/i18n/request-locale";
import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import {
  decideTalentProfileLocale,
  ogLocale,
  talentProfileAlternates,
  type TalentProfileLocale,
} from "./talent-profile-locale";

/** The locale a public talent profile renders in, bounded to the talent's set. */
export async function resolveTalentProfileLocale(profileId: string): Promise<TalentProfileLocale> {
  const [requested, settings] = await Promise.all([
    getRequestLocale(),
    loadTalentLocaleSettings(profileId),
  ]);
  return decideTalentProfileLocale({
    requested,
    primary: settings.defaultLocale,
    supported: settings.supportedLocales,
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
}) {
  const [profile, language] = await Promise.all([
    resolveTalentProfileLocale(input.profileId),
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
