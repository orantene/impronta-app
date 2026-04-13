import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { LogOut, Search, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { AccountMenu } from "@/components/account-menu";
import { PublicLanguageToggle } from "@/components/public-language-toggle";
import { PublicHeaderDiscoveryTools } from "@/components/public-header-discovery-tools";
import {
  getRequestLocale,
  ORIGINAL_PATHNAME_HEADER,
} from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { stripLocaleFromPathname, withLocalePath } from "@/i18n/pathnames";
import {
  loadAccessProfile,
  type AccessProfileWithDisplayName,
} from "@/lib/access-profile";
import {
  isStaffRole,
  resolveAccountHref,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import { Button } from "@/components/ui/button";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { createClient } from "@/lib/supabase/server";

export async function PublicHeader() {
  const locale = await getRequestLocale();
  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);
  const t = createTranslator(locale);
  const supabase = await createClient();

  let user: { id: string } | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  let profile: AccessProfileWithDisplayName | null = null;

  if (supabase && user) {
    profile = await loadAccessProfile(supabase, user.id);
  }

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

  const savedIds = await getSavedTalentIds();

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
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="relative flex h-16 w-full items-center justify-between px-4 sm:h-[4.25rem] sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 justify-start">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link
              href={withLocalePath("/directory", locale)}
              aria-label={t("public.header.searchTalentAria")}
            >
              <Search className="size-5" />
            </Link>
          </Button>
        </div>

        <Link
          href={withLocalePath("/", locale)}
          className="font-display absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-lg font-medium tracking-[0.2em] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-xl"
        >
          IMPRONTA
        </Link>

        <div className="flex flex-1 items-center justify-end gap-0.5 sm:gap-1">
          <Suspense
            fallback={
              <div className="mr-1 hidden h-7 w-[4.25rem] shrink-0 rounded-md border border-border/60 bg-background/80 sm:block" />
            }
          >
            <PublicLanguageToggle
              className="mr-1 hidden sm:flex"
              activeLocale={locale}
              pathnameWithoutLocale={pathnameWithoutLocale}
            />
          </Suspense>
          <PublicHeaderDiscoveryTools
            locale={locale}
            pathnameWithoutLocale={pathnameWithoutLocale}
            initialSavedCount={savedIds.length}
            directoryHeaderCopy={directoryHeaderCopy}
            savedDirectoryAria={t("public.header.savedDirectoryAria")}
          />
          {user ? (
            <>
              {destination === "/onboarding/role" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-1"
                  asChild
                >
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
          )}
        </div>
      </div>
    </header>
  );
}
