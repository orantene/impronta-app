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
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";
import {
  isStaffRole,
  resolveAccountHref,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import { Button } from "@/components/ui/button";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { getPublicCmsNavigationLinks } from "@/lib/cms/public-navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPublicHostContext } from "@/lib/saas";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { sanitizeBrandMarkSvg } from "@/lib/site-admin/sanitize-svg";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export async function PublicHeader() {
  const locale = await getRequestLocale();
  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);
  const t = createTranslator(locale);
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

  const savedIds = await getSavedTalentIds();
  const cmsHeaderLinks = await getPublicCmsNavigationLinks(locale, "header");

  const hostContext = await getPublicHostContext();
  const tenantIdForIdentity =
    hostContext.kind === "agency" || hostContext.kind === "hub"
      ? hostContext.tenantId
      : null;
  const [identity, branding] = tenantIdForIdentity
    ? await Promise.all([
        loadPublicIdentity(tenantIdForIdentity),
        loadPublicBranding(tenantIdForIdentity),
      ])
    : [null, null];
  const brandLabel = identity?.public_name?.trim() || PLATFORM_BRAND.name;

  // Re-sanitize at render time — defense in depth. The admin path already
  // sanitized at save, but render-side sanitize is cheap and guarantees we
  // never ship arbitrary markup if the column got populated out-of-band
  // (seeding script, direct SQL, etc).
  const brandMarkRaw = branding?.brand_mark_svg ?? null;
  const brandMarkSvg = brandMarkRaw
    ? (sanitizeBrandMarkSvg(brandMarkRaw).svg ?? null)
    : null;

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
      <div className="relative grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 sm:h-[4.25rem] sm:gap-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-start gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link
              href={withLocalePath("/directory", locale)}
              aria-label={t("public.header.searchTalentAria")}
            >
              <Search className="size-5" />
            </Link>
          </Button>
          {cmsHeaderLinks.length > 0 ? (
            <nav
              className="hidden min-w-0 items-center gap-2 overflow-x-auto md:flex lg:gap-3"
              aria-label="Site links"
            >
              {cmsHeaderLinks.map((l) => (
                <Link
                  key={`${l.href}:${l.label}`}
                  href={l.href}
                  className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>

        <Link
          href={withLocalePath("/", locale)}
          className="font-display flex min-w-0 items-center justify-center gap-2 whitespace-nowrap text-[0.7rem] font-medium uppercase tracking-[0.16em] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-base sm:tracking-[0.2em] lg:text-lg xl:text-xl"
        >
          {brandMarkSvg ? (
            <span
              aria-hidden
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-primary sm:h-6 sm:w-6 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: brandMarkSvg }}
            />
          ) : null}
          <span className="truncate">{brandLabel}</span>
        </Link>

        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
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
