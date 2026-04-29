import Link from "next/link";
import { headers } from "next/headers";
import { LogOut, Search, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { AccountMenu } from "@/components/account-menu";
import { PublicLanguageToggle } from "@/components/public-language-toggle";
import { PublicHeaderDiscoveryTools } from "@/components/public-header-discovery-tools";
import { PublicHeaderMobileMenu } from "@/components/public-header-mobile-menu";
import { PublicHeaderOverHeroSensor } from "@/components/public-header-over-hero-sensor";
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

  // ── Step-4 token reads ───────────────────────────────────────────────
  // These four shell tokens shape the bar layout, brand position, and
  // CTA visibility. Token values come from agency_branding.theme_json
  // (already loaded above); each value MUST produce a visible difference
  // in the rendered DOM — that's the contract that justified adding them
  // to the registry.
  const themeJson = (branding?.theme_json ?? {}) as Record<string, unknown>;
  const tokenString = (key: string, fallback: string): string => {
    const v = themeJson[key];
    return typeof v === "string" && v.length > 0 ? v : fallback;
  };
  const brandLayout = tokenString(
    "shell.header-brand-layout",
    "inline",
  ) as "inline" | "stacked" | "logo-only" | "text-only";
  const navAlignment = tokenString(
    "shell.header-nav-alignment",
    "left",
  ) as "left" | "center" | "right" | "split-around-logo";
  const ctaPlacement = tokenString(
    "shell.header-cta-placement",
    "right",
  ) as "right" | "inside-menu-only" | "both" | "hidden";
  const mobileCtaPlacement = tokenString(
    "shell.header-mobile-cta-placement",
    "outside",
  ) as "outside" | "inside" | "both" | "hidden";

  // CTA pulled from identity (single source). Renders only when both
  // label and href are present and the placement token allows it.
  const ctaLabel = identity?.primary_cta_label?.trim() || null;
  const ctaHref = identity?.primary_cta_href?.trim() || null;
  const hasCta = Boolean(ctaLabel && ctaHref);
  const showCtaInDesktopBar =
    hasCta && (ctaPlacement === "right" || ctaPlacement === "both");
  const showCtaInMobileBar =
    hasCta &&
    (mobileCtaPlacement === "outside" || mobileCtaPlacement === "both");
  const showCtaInMobileMenu =
    hasCta &&
    (ctaPlacement === "inside-menu-only" ||
      ctaPlacement === "both" ||
      mobileCtaPlacement === "inside" ||
      mobileCtaPlacement === "both");

  // Nav distribution per alignment. The brand always lives in the
  // center grid column; the nav links fan out to the appropriate
  // columns. `split-around-logo` divides links roughly in half so
  // longer menus still balance visually.
  const halfPoint = Math.ceil(cmsHeaderLinks.length / 2);
  const navInLeftCol =
    navAlignment === "left"
      ? cmsHeaderLinks
      : navAlignment === "split-around-logo"
        ? cmsHeaderLinks.slice(0, halfPoint)
        : [];
  const navInCenterCol =
    navAlignment === "center" ? cmsHeaderLinks : [];
  const navInRightCol =
    navAlignment === "right"
      ? cmsHeaderLinks
      : navAlignment === "split-around-logo"
        ? cmsHeaderLinks.slice(halfPoint)
        : [];

  // Brand link className varies per layout.
  const brandLinkClass = [
    // Common: focus ring, color transition.
    "font-display group flex min-w-0 whitespace-nowrap font-medium uppercase tracking-[0.16em] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // Layout-specific: stacked is column; the others are row.
    brandLayout === "stacked"
      ? "flex-col items-center justify-center gap-1 text-[0.6rem] sm:text-[0.7rem] lg:text-[0.8rem]"
      : "items-center justify-center gap-2 text-[0.7rem] sm:text-base sm:tracking-[0.2em] lg:text-lg xl:text-xl",
  ].join(" ");
  const showBrandMark =
    brandMarkSvg && brandLayout !== "text-only";
  const showBrandText = brandLayout !== "logo-only";

  return (
    <header
      data-public-header
      // `public-header` is the CSS hook the design-token system targets
      // (see web/src/app/token-presets.css §"Shell variants"). Without it,
      // every `html[data-token-shell-header-variant="…"] .public-header`
      // rule silently fails to match — which is what kept the wired
      // header tokens from doing anything visible until 2026-04-29.
      className="public-header sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md"
      // SSR initial state for the transparent-on-hero rule. The sensor
      // (mounted at the bottom of this header) flips this to "false"
      // once the user scrolls past the threshold. We MUST render this
      // attribute on the server to avoid a hydration mismatch — the
      // sensor used to set it via inline script before React hydrated,
      // which React 18+ treats as a tree-hydration error.
      data-over-hero="true"
    >
      <div
        data-token-brand-layout={brandLayout}
        data-token-nav-alignment={navAlignment}
        className="relative grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 sm:h-[4.25rem] sm:gap-3 sm:px-6 lg:px-8"
      >
        <div className="flex items-center justify-start gap-1 sm:gap-2">
          {/* Mobile hamburger — visible <md only. Mounts the mobile
           *  menu drawer keyed off the shell.mobile-nav-variant token. */}
          <PublicHeaderMobileMenu
            navLinks={cmsHeaderLinks}
            locale={locale}
            pathnameWithoutLocale={pathnameWithoutLocale}
            brandLabel={brandLabel}
            ctaLabel={showCtaInMobileMenu ? ctaLabel : null}
            ctaHref={showCtaInMobileMenu ? ctaHref : null}
            openMenuLabel={t("public.header.openMenuAria")}
            closeMenuLabel={t("public.header.closeMenuAria")}
          />
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link
              href={withLocalePath("/directory", locale)}
              aria-label={t("public.header.searchTalentAria")}
            >
              <Search className="size-5" />
            </Link>
          </Button>
          {navInLeftCol.length > 0 ? (
            <nav
              className="public-header__nav public-header__nav--left hidden min-w-0 items-center gap-2 overflow-x-auto md:flex lg:gap-3"
              aria-label="Site links"
            >
              {navInLeftCol.map((l) => (
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

        {navInCenterCol.length > 0 ? (
          // Center alignment: brand sits at the start of the center
          // column with the nav fanning out to its right. Keeps the brand
          // visible while honoring the operator's "centered nav" intent.
          <div className="flex min-w-0 items-center justify-center gap-3 sm:gap-5">
            <Link href={withLocalePath("/", locale)} className={brandLinkClass}>
              {showBrandMark ? (
                <span
                  aria-hidden
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-primary sm:h-6 sm:w-6 [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: brandMarkSvg! }}
                />
              ) : null}
              {showBrandText ? (
                <span className="truncate">{brandLabel}</span>
              ) : null}
            </Link>
            <nav
              className="public-header__nav public-header__nav--center hidden min-w-0 items-center gap-2 overflow-x-auto md:flex lg:gap-3"
              aria-label="Site links"
            >
              {navInCenterCol.map((l) => (
                <Link
                  key={`${l.href}:${l.label}`}
                  href={l.href}
                  className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        ) : (
          <Link href={withLocalePath("/", locale)} className={brandLinkClass}>
            {showBrandMark ? (
              <span
                aria-hidden
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-primary sm:h-6 sm:w-6 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: brandMarkSvg! }}
              />
            ) : null}
            {showBrandText ? (
              <span className="truncate">{brandLabel}</span>
            ) : null}
          </Link>
        )}

        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
          {navInRightCol.length > 0 ? (
            <nav
              className="public-header__nav public-header__nav--right mr-2 hidden min-w-0 items-center gap-2 overflow-x-auto md:flex lg:gap-3"
              aria-label="Site links"
            >
              {navInRightCol.map((l) => (
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
          {showCtaInDesktopBar ? (
            <Button
              size="sm"
              className={`mr-1 hidden md:inline-flex ${showCtaInMobileBar ? "sm:inline-flex" : ""}`}
              asChild
            >
              <Link href={ctaHref!}>{ctaLabel!}</Link>
            </Button>
          ) : null}
          {showCtaInMobileBar && !showCtaInDesktopBar ? (
            <Button size="sm" className="mr-1 inline-flex md:hidden" asChild>
              <Link href={ctaHref!}>{ctaLabel!}</Link>
            </Button>
          ) : null}
          <PublicLanguageToggle
            className="mr-1 hidden sm:flex"
            activeLocale={locale}
            pathnameWithoutLocale={pathnameWithoutLocale}
          />
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
      {/* Sensor sets `data-over-hero` on this header so the
       *  `shell.header-transparent-on-hero="on"` token rule can fire.
       *  No-op when that token is "off" (default) — the rule won't match. */}
      <PublicHeaderOverHeroSensor />
    </header>
  );
}
