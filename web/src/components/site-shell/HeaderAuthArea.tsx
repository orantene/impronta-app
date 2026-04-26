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
import { LogOut, UserRound } from "lucide-react";

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
import { stripLocaleFromPathname, withLocalePath } from "@/i18n/pathnames";
import type { Locale } from "@/i18n/config";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getSavedTalentIds } from "@/lib/public-discovery";
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
}

export async function HeaderAuthArea({
  locale,
  showAccountMenu,
  showLanguageToggle,
  showDiscoveryTools,
}: Props) {
  if (!showAccountMenu && !showLanguageToggle && !showDiscoveryTools) {
    return null;
  }
  const t = createTranslator(locale);
  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);
  const actor = await getCachedActorSession();
  const user = actor.user;
  const profile: AccessProfileWithDisplayName | null = actor.profile;
  const accountLink = resolveAccountHref(Boolean(user), profile);
  const destination = resolveAuthenticatedDestination(profile);
  const secondaryAction = !user
    ? null
    : destination === "/onboarding/role"
      ? { href: "/onboarding/role", label: t("public.header.finishSetup") }
      : isStaffRole(profile?.app_role)
        ? { href: "/admin/inquiries", label: t("public.header.inquiries") }
        : profile?.app_role === "talent"
          ? { href: "/talent/edit-profile", label: t("public.header.myProfile") }
          : { href: "/client/overview", label: t("public.header.dashboard") };

  const savedIds = showDiscoveryTools ? await getSavedTalentIds() : [];

  const directoryHeaderCopy = {
    shortlistAria: t("public.header.directoryShortlistAria"),
    shortlistTooltipEmpty: t("public.header.directoryShortlistTooltipEmpty"),
    shortlistTooltipWithCount: t("public.header.directoryShortlistTooltipWithCount"),
    inquirySparklesAriaEmpty: t("public.header.directoryInquirySparklesAriaEmpty"),
    inquirySparklesAriaWithShortlist: t(
      "public.header.directoryInquirySparklesAriaWithShortlist",
    ),
    inquiryTooltipEmpty: t("public.header.directoryInquiryTooltipEmpty"),
    inquiryTooltipWithShortlist: t("public.header.directoryInquiryTooltipWithShortlist"),
  };

  return (
    <div className="site-header__auth flex items-center justify-end gap-0.5 sm:gap-1">
      {showLanguageToggle ? (
        <PublicLanguageToggle
          className="mr-1 hidden sm:flex"
          activeLocale={locale}
          pathnameWithoutLocale={pathnameWithoutLocale}
        />
      ) : null}
      {showDiscoveryTools ? (
        <PublicHeaderDiscoveryTools
          locale={locale}
          pathnameWithoutLocale={pathnameWithoutLocale}
          initialSavedCount={savedIds.length}
          directoryHeaderCopy={directoryHeaderCopy}
          savedDirectoryAria={t("public.header.savedDirectoryAria")}
        />
      ) : null}
      {showAccountMenu ? (
        user ? (
          <>
            {destination === "/onboarding/role" ? (
              <Button size="sm" variant="outline" className="ml-1" asChild>
                <Link
                  href={withLocalePath(accountLink.href, locale)}
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
                  href: withLocalePath(accountLink.href, locale),
                  label: t("public.header.dashboard"),
                }}
                secondaryAction={secondaryAction}
                signOutAction={signOut}
              />
            )}
            <form action={signOut} className="ml-0.5">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("public.header.signOutAria")}
              >
                <LogOut className="size-5" />
              </Button>
            </form>
          </>
        ) : (
          <Button size="icon" variant="ghost" className="shrink-0" asChild>
            <Link
              href={withLocalePath(accountLink.href, locale)}
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
