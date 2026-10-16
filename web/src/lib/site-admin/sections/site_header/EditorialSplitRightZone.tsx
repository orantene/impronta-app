/**
 * Phase 6B editorial-split right zone: real destinations only (no invented
 * data). Other variants keep HeaderAuthArea unchanged. Extracted from
 * Component.tsx to stay under the 800-line cap (TUL-519 card 77).
 */

import { EditorialSplitActions } from "./EditorialSplitActions";
import { HeaderAuthArea } from "@/components/site-shell/HeaderAuthArea";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getLocaleMetadata, type Locale } from "@/i18n/config";
import { headers } from "next/headers";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { localeUrlSettings, stripLocaleFromPathname, withLocalePath } from "@/i18n/pathnames";
import { publicLocaleHref } from "@/i18n/client-directory-href";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import { resolveAccountHref } from "@/lib/auth-flow";
import type { TenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

export async function renderRightZone(
  variant: string | undefined,
  locale: Locale,
  primaryCta: { label: string; href: string; external?: boolean } | null,
  navItems: { label: string; href: string; external?: boolean }[],
  showAccount: boolean,
  showLanguage: boolean,
  showDiscovery: boolean,
  localeSettings: TenantLocaleSettings,
  discoveryHref: string,
) {
  if (variant !== "editorial-split") {
    return showAccount || showLanguage || showDiscovery ? (
      <HeaderAuthArea
        locale={locale}
        showAccountMenu={showAccount}
        showLanguageToggle={showLanguage}
        showDiscoveryTools={showDiscovery}
        availableLocales={localeSettings.supportedLocales}
        defaultLocale={localeSettings.defaultLocale}
        showLanguageSwitcher={localeSettings.showLanguageSwitcher}
      />
    ) : null;
  }
  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const pathSettings = localeUrlSettings(localeSettings.defaultLocale, localeSettings.supportedLocales);
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath, pathSettings);
  const actor = await getCachedActorSession();
  const account = resolveAccountHref(Boolean(actor.user), actor.profile, locale);
  const [savedIds, favoriteIds] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
  ]);
  const localeLinks = showLanguage
    ? localeSettings.supportedLocales.map((code) => ({
        code,
        label: getLocaleMetadata(code).label,
        href: withLocalePath(pathnameWithoutLocale, code, pathSettings),
      }))
    : [];
  return (
    <EditorialSplitActions
      localeLinks={localeLinks}
      activeLocale={locale}
      navItems={navItems}
      primaryCta={primaryCta}
      directoryHref={publicLocaleHref(pathnameWithoutLocale, discoveryHref, locale, pathSettings)}
      accountHref={account.href}
      accountLabel={account.label}
      savedCount={savedIds.length}
      favoritesCount={favoriteIds.length}
      copy={{
        menu: pickLocale(locale, { en: "Menu", es: "Menú" }),
        close: pickLocale(locale, { en: "Close", es: "Cerrar" }),
        saved: pickLocale(locale, { en: "Saved", es: "Guardados" }),
        inquiry: pickLocale(locale, { en: "Your inquiry", es: "Tu solicitud" }),
        startInquiry: pickLocale(locale, { en: "Start an inquiry", es: "Iniciar solicitud" }),
        exploreTalent: pickLocale(locale, { en: "Explore talent", es: "Explorar talento" }),
        language: pickLocale(locale, { en: "Language", es: "Idioma" }),
      }}
    />
  );
}
