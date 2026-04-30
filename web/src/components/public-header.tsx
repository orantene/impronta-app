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
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";

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

  // Edit-mode flag determines whether the header gets selection
  // markers. Loaded once per request; cheap (it just reads the
  // edit-mode cookie). Off-tenant requests fall through to false.
  const editActive = tenantIdForIdentity
    ? await isEditModeActiveForTenant(tenantIdForIdentity)
    : false;

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
  // 2026-04-30 — Brand position is now a first-class control,
  // independent of brand layout. Operators want the logo on the left
  // (default editorial), centered (boutique), or right (rare type-
  // forward layouts). Older theme rows without this token fall back to
  // "left" so existing storefronts don't visually drift on deploy.
  const brandPosition = tokenString(
    "shell.header-brand-position",
    "left",
  ) as "left" | "center" | "right";
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

  // 2026-04-30 — Free-form header surface colors. Project as CSS custom
  // properties on the <header> element; CSS in token-presets.css uses
  // them with a fallback chain (`var(--token-shell-header-bg, …)`) so
  // an unset value falls back to the active background-mode default.
  const headerBg = tokenString("shell.header-bg", "");
  const headerText = tokenString("shell.header-text", "");
  const headerBorder = tokenString("shell.header-border", "");
  const headerStyleVars: React.CSSProperties = {};
  if (headerBg) (headerStyleVars as Record<string, string>)["--token-shell-header-bg"] = headerBg;
  if (headerText) (headerStyleVars as Record<string, string>)["--token-shell-header-text"] = headerText;
  if (headerBorder) (headerStyleVars as Record<string, string>)["--token-shell-header-border"] = headerBorder;

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

  // Reusable brand element — composed once so the three columns can
  // each conditionally drop it in based on `brand-position` without
  // duplicating the logo + label markup.
  const brandLink = (
    <Link
      href={withLocalePath("/", locale)}
      className={brandLinkClass}
      data-brand-slot
    >
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
  );

  // Resolved column placement — the operator chose where the brand
  // anchors via `shell.header-brand-position`. `split-around-logo` nav
  // implicitly demands a centered brand (the literal split is around
  // the logo); we honor that by forcing center when nav is split.
  const effectiveBrandPosition: "left" | "center" | "right" =
    navAlignment === "split-around-logo" ? "center" : brandPosition;
  const brandInLeftCol = effectiveBrandPosition === "left";
  const brandInCenterCol = effectiveBrandPosition === "center";
  const brandInRightCol = effectiveBrandPosition === "right";

  // Selection wrapper for in-canvas editing. Only mounts when edit
  // mode is active so the public storefront stays clean. The selection
  // layer queries `[data-cms-section]`; the inspector dock matches the
  // synthetic section id to dispatch to <SiteHeaderInspector>.
  const renderedHeader = (
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
      // Custom color CSS vars — empty unless the operator set
      // `shell.header-bg` / `-text` / `-border` in the Style tab. CSS
      // in token-presets.css consumes these with `var(…, fallback)`.
      style={headerStyleVars}
      data-brand-position={effectiveBrandPosition}
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
          {brandInLeftCol ? (
            <span className="ml-1 hidden md:inline-flex">{brandLink}</span>
          ) : null}
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

        {/* Center column.
         *  - On mobile (<md), the brand always lives here so it's never
         *    pushed off-screen by the hamburger / search / utility cluster.
         *  - On desktop, the brand only renders here when
         *    `brand-position=center` (split-nav forces this regardless).
         *  - Nav links here only when `nav-alignment=center`.
         *  - The wrapper is always present so the 1fr middle column
         *    keeps its width and the right column doesn't slide left. */}
        <div className="flex min-w-0 items-center justify-center gap-3 sm:gap-5">
          {/* Desktop brand (when centered) */}
          {brandInCenterCol ? (
            <span className="hidden md:inline-flex">{brandLink}</span>
          ) : null}
          {/* Mobile brand fallback — always visible <md, regardless of
           *  the chosen brand-position, so the bar never reads "where's
           *  the logo" on a phone. */}
          <span className="md:hidden">{brandLink}</span>
          {navInCenterCol.length > 0 ? (
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
          ) : null}
        </div>

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
          {brandInRightCol ? (
            <span className="mr-2 hidden md:inline-flex">{brandLink}</span>
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

  if (!editActive) {
    return renderedHeader;
  }

  // Edit mode: wrap the header in `[data-cms-section]` so the
  // selection layer detects clicks. The synthetic ID short-circuits
  // the inspector dock's section-load path and routes to
  // <SiteHeaderInspector>. Wrapper must NOT introduce a stacking
  // context (no transform, no overflow, no z-index) — the header's
  // sticky positioning relies on the body being its scroll context.
  //
  // The wrapper also carries an "Edit header" hover hint — a small
  // floating pill that fades in when the operator hovers the header.
  // Pure CSS (group + group-hover); no client JS. Discoverability
  // affordance only — clicking the header itself still does the work.
  return (
    <div
      data-cms-section=""
      data-section-id={SITE_HEADER_SELECTION_ID}
      data-section-type-key="site_header"
      data-slot-key="header"
      className="group relative"
    >
      {renderedHeader}
      <span
        aria-hidden
        // body[data-edit-preview="1"] is set by EditContext when the
        // operator flips the Preview toggle on the topbar; the rule
        // in app/globals.css forces this affordance off so the header
        // looks like a real visitor would see it.
        data-edit-affordance="header-pill"
        className="pointer-events-none absolute right-3 top-2 z-[55] flex items-center gap-1 rounded-full bg-indigo-500/95 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white opacity-0 shadow-md backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
        </svg>
        Edit header
      </span>
    </div>
  );
}
