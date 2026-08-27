import "server-only";

/**
 * Phase B.2 — auth widgets re-mounted inside the snapshot-shell header.
 *
 * Server Component. The snapshot-rendered `site_header` section can render
 * operator-edited content (brand, nav, primary CTA), but it must NOT cause
 * tenants like impronta to lose the auth-aware widgets that the legacy
 * `PublicHeader` provides — account menu, language toggle, discovery
 * search. Guardrail 5 of B.2 is explicit: "we are not degrading the
 * current Impronta experience in a confusing way."
 *
 * This component re-uses the EXACT same widgets the legacy `PublicHeader`
 * renders. The schema toggles (`authArea.show*`) only decide visibility;
 * the widgets' internals are owned by their existing implementations
 * (`AccountMenu`, `PublicLanguageToggle`, `PublicHeaderDiscoveryTools`).
 *
 * The result: a tenant promoted onto the snapshot shell with default flags
 * (all true) sees IDENTICAL auth chrome to what the legacy `PublicHeader`
 * showed — same component, same data, same behavior. Operator gets to
 * edit the brand + nav portions; the auth portions stay as-is.
 */

import Link from "next/link";
import { UserRound } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { AccountMenu } from "@/components/account-menu";
import { PublicLanguageToggle } from "@/components/public-language-toggle";
import { PublicHeaderDiscoveryTools } from "@/components/public-header-discovery-tools";
import { Button } from "@/components/ui/button";
import { headers } from "next/headers";
import {
  ORIGINAL_PATHNAME_HEADER,
} from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import {
  localeUrlSettings,
  stripLocaleFromPathname,
  withLocalePath,
} from "@/i18n/pathnames";
import { getPublicHostContext } from "@/lib/saas/scope";
import { hostSafeDestination } from "@/lib/saas/host-safe-destination";
import type { Locale } from "@/i18n/config";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import {
  isStaffRole,
  resolveAccountHref,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";

interface Props {
  locale: Locale;
  showAccountMenu: boolean;
  showLanguageToggle: boolean;
  showDiscoveryTools: boolean;
  availableLocales?: readonly Locale[];
  defaultLocale?: Locale;
  showLanguageSwitcher?: boolean;
}

export async function HeaderAuthArea({
  locale,
  showAccountMenu,
  showLanguageToggle,
  showDiscoveryTools,
  // `availableLocales` defaults to FALLBACK_LANGUAGE_SETTINGS.publicLocales so
  // call sites that haven't been updated yet still compile. The toggle hides
  // itself when availableLocales.length <= 1 (PublicLanguageToggle contract).
  availableLocales = ["en", "es"],
  defaultLocale = "en",
  showLanguageSwitcher = true,
}: Props) {
  if (!showAccountMenu && !showLanguageToggle && !showDiscoveryTools) {
    return null;
  }
  const t = createTranslator(locale);
  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  // The caller already hands us the tenant's locale pair (`availableLocales` +
  // `defaultLocale`); build the URL grammar from THOSE rather than letting the
  // pathname helpers fall back to the platform `en`-default grammar.
  const pathSettings = localeUrlSettings(defaultLocale, availableLocales);
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    originalPath,
    pathSettings,
  );
  const actor = await getCachedActorSession();
  const user = actor.user;
  const profile: AccessProfileWithDisplayName | null = actor.profile;
  const accountLink = resolveAccountHref(Boolean(user), profile);
  const destination = resolveAuthenticatedDestination(profile);

  // Host-safe. The published CMS shell renders this on hub hosts, where
  // /admin, /client, /talent and /onboarding/role do not exist: relative,
  // every account link here was a 404. Absolute app-host URLs carry no
  // locale prefix, so only same-surface paths get withLocalePath.
  const hostKind = (await getPublicHostContext()).kind;
  const accountHref = (href: string) => {
    const hostSafe = hostSafeDestination(href, hostKind);
    return hostSafe === href ? withLocalePath(href, locale, pathSettings) : hostSafe;
  };
  const secondaryActionRaw = !user
    ? null
    : destination === "/onboarding/role"
      ? { href: "/onboarding/role", label: t("public.header.finishSetup") }
      : isStaffRole(profile?.app_role)
        ? { href: "/admin", label: t("public.header.inquiries") }
        : profile?.app_role === "talent"
          ? { href: "/talent", label: t("public.header.myProfile") }
          : { href: "/client", label: t("public.header.dashboard") };

  // Same host-safety as the primary link: these are raw workspace paths.
  const secondaryAction = secondaryActionRaw
    ? { ...secondaryActionRaw, href: accountHref(secondaryActionRaw.href) }
    : null;

  const [savedIds, favoriteIds] = showDiscoveryTools
    ? await Promise.all([getSavedTalentIds(), getFavoriteTalentIds()])
    : [[], []];

  const directoryHeaderCopy = {
    favoritesAria: t("public.header.directoryShortlistAria"),
    favoritesTooltipEmpty: t("public.header.directoryShortlistTooltipEmpty"),
    favoritesTooltipWithCount: t("public.header.directoryShortlistTooltipWithCount"),
    inquiryAriaEmpty: t("public.header.directoryInquirySparklesAriaEmpty"),
    inquiryAriaWithCart: t(
      "public.header.directoryInquirySparklesAriaWithShortlist",
    ),
    inquiryTooltipEmpty: t("public.header.directoryInquiryTooltipEmpty"),
    inquiryTooltipWithCart: t("public.header.directoryInquiryTooltipWithShortlist"),
  };

  return (
    <div className="site-header__auth flex items-center justify-end gap-0.5 sm:gap-1">
      {showLanguageToggle ? (
        <PublicLanguageToggle
          className="mr-1 hidden sm:flex"
          activeLocale={locale}
          pathnameWithoutLocale={pathnameWithoutLocale}
          availableLocales={availableLocales}
          defaultLocale={defaultLocale}
          showLanguageSwitcher={showLanguageSwitcher}
        />
      ) : null}
      {showDiscoveryTools ? (
        <PublicHeaderDiscoveryTools
          initialFavoritesCount={favoriteIds.length}
          initialCartCount={savedIds.length}
          directoryHeaderCopy={directoryHeaderCopy}
        />
      ) : null}
      {showAccountMenu ? (
        user ? (
          <>
            {destination === "/onboarding/role" ? (
              <Button size="sm" variant="outline" className="ml-1" asChild>
                <Link
                  href={accountHref(accountLink.href)}
                  aria-label={accountLink.label}
                >
                  {t("public.header.setup")}
                </Link>
              </Button>
            ) : (
              <AccountMenu
                triggerLabel={accountLink.label}
                displayName={profile?.display_name ?? t("public.header.accountFallback")}
                roleLabel={
                  profile?.app_role
                    ? profile.app_role.replace(/_/g, " ")
                    : t("public.header.signedInRole")
                }
                dashboardAction={{
                  href: accountHref(accountLink.href),
                  label: t("public.header.dashboard"),
                }}
                secondaryAction={secondaryAction}
                signOutAction={signOut}
              />
            )}
          </>
        ) : (
          <Button size="icon" variant="ghost" className="shrink-0" asChild>
            <Link
              href={accountHref(accountLink.href)}
              aria-label={accountLink.label}
            >
              <UserRound className="size-5" />
            </Link>
          </Button>
        )
      ) : null}
    </div>
  );
}
