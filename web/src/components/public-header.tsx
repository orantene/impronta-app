import Link from "next/link";
import { headers } from "next/headers";
import { LogOut, Search, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { AccountMenu } from "@/components/account-menu";
import { hostSafeDestination } from "@/lib/saas/host-safe-destination";
import { PublicLanguageToggle } from "@/components/public-language-toggle";
import { PublicHeaderDiscoveryTools } from "@/components/public-header-discovery-tools";
import {
  PublicHeaderMobileMenu,
  type MobileMenuRoleNavLink,
  type MobileMenuUserIdentity,
} from "@/components/public-header-mobile-menu";
import { PublicHeaderOverHeroSensor } from "@/components/public-header-over-hero-sensor";
import {
  getRequestLocale,
  ORIGINAL_PATHNAME_HEADER,
} from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { publicLocaleHref } from "@/i18n/client-directory-href";
import { localeUrlSettings, stripLocaleFromPathname } from "@/i18n/pathnames";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";
import {
  resolveAccountHref,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import { Button } from "@/components/ui/button";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import { getPublicCmsNavigationLinks } from "@/lib/cms/public-navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPublicHostContext } from "@/lib/saas";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadTenantWords } from "@/lib/words/server";
import { resolveHeaderVerbDestination } from "@/lib/words/verb-destination.server";
import {
  loadRegistrationSettings,
  registrationIsLive,
} from "@/lib/saas/registration-settings";
import { OpenTenantRegisterButton } from "@/components/marketing/tenant-register-modal-host";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { sanitizeBrandMarkSvg } from "@/lib/site-admin/sanitize-svg";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";
import {
  PublishedShellHeader,
  shouldRenderSnapshotShell,
} from "@/components/site-shell/PublishedShell";

// C2 — Build role-specific dashboard nav links for the mobile menu.
// Paths are absolute (no tenant slug) — the middleware/routing layer maps
// /client, /talent, /admin to the scoped workspace routes on each host.
function buildRoleNavLinks(
  appRole: string | null | undefined,
  headerHref: (href: string) => string,
): MobileMenuRoleNavLink[] {
  if (!appRole) return [];

  if (appRole === "client") {
    return [
      { label: "Today",      href: headerHref("/client/today") },
      { label: "Discover",   href: headerHref("/client/discover") },
      { label: "Favorites",  href: headerHref("/client/favorites") },
      { label: "Shortlists", href: headerHref("/client/shortlists") },
      { label: "Inquiries",  href: headerHref("/client/inquiries") },
      { label: "Messages",   href: headerHref("/client/messages") },
      { label: "Bookings",   href: headerHref("/client/bookings") },
      { label: "Settings",   href: headerHref("/client/settings") },
    ];
  }

  if (appRole === "talent") {
    return [
      { label: "Today",     href: headerHref("/talent/today") },
      { label: "Messages",  href: headerHref("/talent/messages") },
      { label: "Profile",   href: headerHref("/talent/profile") },
      { label: "Calendar",  href: headerHref("/talent/calendar") },
      { label: "Agencies",  href: headerHref("/talent/agencies") },
      { label: "Settings",  href: headerHref("/talent/settings") },
    ];
  }

  // super_admin or agency_staff
  if (appRole === "super_admin" || appRole === "agency_staff") {
    return [
      { label: "Home",     href: headerHref("/admin") },
      { label: "Requests", href: headerHref("/admin/inquiries") },
      { label: "Bookings", href: headerHref("/admin/bookings") },
      { label: "Talents",  href: headerHref("/admin/talent") },
      { label: "Clients",  href: headerHref("/admin/clients") },
      { label: "Settings", href: headerHref("/admin/settings") },
    ];
  }

  return [];
}

export async function PublicHeader() {
  const locale = await getRequestLocale();
  const hostContext = await getPublicHostContext();
  const tenantIdForIdentity =
    hostContext.kind === "agency" || hostContext.kind === "hub"
      ? hostContext.tenantId
      : null;

  if (
    tenantIdForIdentity &&
    (await shouldRenderSnapshotShell(tenantIdForIdentity, locale))
  ) {
    return <PublishedShellHeader tenantId={tenantIdForIdentity} locale={locale} />;
  }

  // For agency/hub hosts: use the tenant's locale settings.
  // For platform/marketing hosts (no tenantId): `loadTenantLocaleSettings("")`
  // returns the platform fallback (single "en", switcher hidden), which is
  // correct — the marketing layout controls its own locale toggle independently.
  const tenantLocaleSettings = await loadTenantLocaleSettings(
    tenantIdForIdentity ?? "",
  );

  // URL grammar for THIS tenant: its default locale is unprefixed, every other
  // supported locale sits under `/{code}`. Without it both the strip below and
  // every href built from it would use the PLATFORM grammar, which inverts on a
  // tenant whose default locale is not the platform default.
  const pathSettings = localeUrlSettings(
    tenantLocaleSettings.defaultLocale,
    tenantLocaleSettings.supportedLocales,
  );

  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    originalPath,
    pathSettings,
  );
  const t = createTranslator(locale);
  const actor = await getCachedActorSession();
  const user = actor.user;
  const profile: AccessProfileWithDisplayName | null = actor.profile;

  // Host-safe. This header renders on `/t/*`, which is allow-listed on the
  // marketing apex and the hub, and every account/dashboard link it builds
  // points at `/admin`, `/client`, `/talent` or `/onboarding/role`, none of
  // which exist on those two surfaces. Relative, the "Dashboard" link was a
  // 404. When the current surface cannot serve the target, send the absolute
  // app-host URL instead and skip the locale prefix (it belongs to the path,
  // not the origin).
  const headerHref = (href: string) => {
    const hostSafe = hostSafeDestination(href, hostContext.kind);
    if (hostSafe !== href) return hostSafe;
    return publicLocaleHref(pathnameWithoutLocale, href, locale, pathSettings);
  };
  const accountLink = resolveAccountHref(Boolean(user), profile);
  const destination = resolveAuthenticatedDestination(profile);
  // C3 — Desktop AccountMenu dedup: secondary action currently always
  // resolves to the same href as the primary dashboard link, so it's a
  // no-op entry. Null it out to keep the dropdown uncluttered.
  const secondaryAction: { href: string; label: string } | null = null;

  // C2/C4 — Role nav + identity for the mobile menu. Only built when the
  // user is fully active (not mid-onboarding) so the menu doesn't show
  // dashboard links to users who haven't chosen a role yet.
  const isActiveSession =
    Boolean(user) &&
    destination !== "/onboarding/role" &&
    destination !== "/";
  const roleNavLinks: MobileMenuRoleNavLink[] = isActiveSession
    ? buildRoleNavLinks(profile?.app_role, headerHref)
    : [];
  const mobileUserIdentity: MobileMenuUserIdentity | null = isActiveSession
    ? {
        displayName:
          profile?.display_name?.trim() ||
          (user?.email ? user.email.split("@")[0] : "You"),
        roleLabel: profile?.app_role
          ? profile.app_role.replace(/_/g, " ")
          : "Signed in",
        dashboardHref: headerHref(accountLink.href),
      }
    : null;

  const [savedIds, favoriteIds] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
  ]);
  const cmsHeaderLinksRaw = await getPublicCmsNavigationLinks(locale, "header");
  const cmsHeaderLinks = cmsHeaderLinksRaw.map((link) => ({
    ...link,
    href: headerHref(link.href),
  }));

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

  // Bookmark icon = favorites (♥, personal saves). Plane icon = inquiry
  // cart (current selection for sending). Two independent surfaces.
  // i18n keys retained for translation continuity; semantics remapped
  // ("shortlist" wording stays for favorites because users mentally
  // bookmark a "shortlist of talents I might want", and sparkles→plane
  // visual is a copy-stable rename).
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
  // Optional nav-only font override. Empty = inherit the site font preset.
  const headerNavFont = tokenString("shell.header-nav-font", "");
  const headerStyleVars: React.CSSProperties = {};
  if (headerBg) (headerStyleVars as Record<string, string>)["--token-shell-header-bg"] = headerBg;
  if (headerText) (headerStyleVars as Record<string, string>)["--token-shell-header-text"] = headerText;
  if (headerBorder) (headerStyleVars as Record<string, string>)["--token-shell-header-border"] = headerBorder;
  if (headerNavFont)
    (headerStyleVars as Record<string, string>)["--token-shell-header-nav-font"] = headerNavFont;

  // CTA pulled from identity (single source). Renders only when both
  // label and href are present and the placement token allows it.
  const explicitCtaLabel = identity?.primary_cta_label?.trim() || null;
  const explicitCtaHref = identity?.primary_cta_href?.trim() || null;

  // THE HEADER VERB.
  //
  // The operator's own CTA always wins. When they have not set one, the
  // industry preset supplies the verb through the words layer: Reserve, Order,
  // Tickets, Book, or Ask. It points at `?inquiry=open`, the chat cue, which
  // needs no route and no seeded page, so the primary call to action on a
  // brand-new site can never point somewhere that 404s. That was the whole
  // failure F1a fixed in the page designs; this stops it recurring in the one
  // button every storefront renders.
  //
  // "custom" (which is also what an absent preset resolves to) adds nothing, so
  // every workspace predating presets keeps exactly today's header.
  const presetVerb =
    tenantIdForIdentity && !(explicitCtaLabel && explicitCtaHref)
      ? await loadTenantWords(tenantIdForIdentity, locale === "es" ? "es" : "en")
      : null;
  const presetVerbLabel =
    presetVerb && presetVerb.preset.id !== "custom"
      ? presetVerb.headerVerbLabel().trim()
      : "";

  const ctaLabel = explicitCtaLabel || (presetVerbLabel || null);
  // THE VERB'S DESTINATION, not a hardcoded chat cue for every verb.
  //
  // This line used to be `presetVerbLabel ? "?inquiry=open" : null`, which took
  // the LABEL from the preset and ignored the verb entirely — so a restaurant's
  // button said "Reserve" and opened the talent inquiry, asking a diner to
  // describe a casting call. Found by clicking it on a live tenant.
  //
  // `resolveHeaderVerbDestination` returns a tenant page only when that page
  // genuinely carries the booking block, and `?inquiry=open` otherwise, so the
  // "a new site can never point somewhere that 404s" property above is kept
  // exactly. It only ever upgrades a destination when a real page exists.
  const presetVerbHref =
    presetVerb && presetVerbLabel && tenantIdForIdentity
      ? await resolveHeaderVerbDestination(tenantIdForIdentity, presetVerb.preset.headerVerb)
      : null;
  const ctaHref = explicitCtaHref || presetVerbHref;

  // AN UNBRANDED TENANT MUST NEVER RENDER AN UNREADABLE CTA.
  //
  // Measured in production on El Paisa, whose `theme_json` is `{}`:
  //
  //     background rgb(17,17,17)   text rgb(10,10,10)     contrast ~1.02:1
  //
  // A solid black button with black text on it. The label was correct
  // ("Reserve") and no human could read it.
  //
  // ROOT CAUSE IS NOT HERE, and this does not pretend to fix it.
  // `.site-theme-tenant-override` in globals.css declares
  //   --impronta-gold: var(--token-color-primary, var(--impronta-gold));
  // whose fallback references ITSELF. That is a cycle, so the declaration is
  // invalid at computed-value time and resolves EMPTY for every tenant with no
  // `color.primary` token. `--primary` then falls back to a dark value while
  // `--primary-foreground` stays `#0a0a0a` from the dark block, and the pair
  // comes apart. The comment fifteen lines below that declaration documents
  // this exact trap and fixed it for `--impronta-black` — the neighbouring
  // lines were left as they were. Every primary button on every unbranded
  // tenant is affected, not just this one, so the real fix belongs with the
  // owner of that stylesheet and is reported separately.
  //
  // What this does is narrower and safe: when the tenant supplies NO brand
  // colour, the preset verb button uses the theme's own ink-on-paper pair,
  // which is defined together and therefore cannot come apart. A tenant that
  // HAS a brand colour keeps it, and an operator's explicit CTA is untouched.
  const hasBrandPrimary = tokenString("color.primary", "").length > 0;
  const ctaNeedsSafePair = Boolean(presetVerbHref) && !explicitCtaHref && !hasBrandPrimary;
  const ctaSafePairClass = ctaNeedsSafePair
    ? " bg-foreground text-background hover:bg-foreground/90"
    : "";
  const hasCta = Boolean(ctaLabel && ctaHref);
  // Tenant Registration Engine — auto "Join the team" CTA. Renders only on a
  // tenant storefront where registration is live AND the operator hasn't set
  // their own primary CTA (their explicit CTA always wins). Opens the branded
  // register modal (mounted by TenantRegisterMount) rather than navigating.
  const registrationSettings = tenantIdForIdentity
    ? await loadRegistrationSettings(tenantIdForIdentity)
    : null;
  const showAutoRegisterCta =
    !hasCta &&
    Boolean(registrationSettings && registrationIsLive(registrationSettings));
  const autoRegisterLabel = registrationSettings?.ctaLabel || "Join the team";
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
  //
  // OVERLAP INVARIANT (owner report 2026-08-27, 390px phone: the centred
  // wordmark painted over the icon buttons on BOTH sides). The bar grid
  // already reserves the two icon clusters — `auto minmax(0,1fr) auto` — so
  // the brand only ever gets the leftover track. What leaked was the wrapper
  // `<span>` each column mounts around `brandLink`: as a flex item its
  // `min-width` was still `auto`, i.e. the wordmark's full min-content width,
  // so it refused to shrink into the narrow centre track and
  // `justify-content:center` spilled the overflow symmetrically over both
  // clusters. `min-w-0` here + `data-brand-slot-wrap` / `data-brand-slot` /
  // `data-brand-label` (whose structural floor lives in token-presets.css, so
  // it survives a utility-class edit) make the brand shrink and ellipsise
  // instead. The icon clusters deliberately keep `min-width:auto` — they are
  // the non-shrinking floor the `auto` tracks are measured from.
  const brandLink = (
    <Link
      href={headerHref("/")}
      className={brandLinkClass}
      data-brand-slot
    >
      {showBrandMark ? (
        <span
          aria-hidden
          className="inline-flex h-7 w-auto shrink-0 items-center justify-center text-primary sm:h-8 [&>svg]:h-full [&>svg]:w-auto"
          dangerouslySetInnerHTML={{ __html: brandMarkSvg! }}
        />
      ) : null}
      {showBrandText ? (
        <span className="min-w-0 truncate" data-brand-label>
          {brandLabel}
        </span>
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
            availableLocales={tenantLocaleSettings.supportedLocales}
            defaultLocale={tenantLocaleSettings.defaultLocale}
            showLanguageSwitcher={tenantLocaleSettings.showLanguageSwitcher}
            brandLabel={brandLabel}
            ctaLabel={showCtaInMobileMenu ? ctaLabel : null}
            ctaHref={showCtaInMobileMenu && ctaHref ? headerHref(ctaHref) : null}
            openMenuLabel={t("public.header.openMenuAria")}
            closeMenuLabel={t("public.header.closeMenuAria")}
            roleNavLinks={roleNavLinks}
            userIdentity={mobileUserIdentity}
            signOutAction={isActiveSession ? signOut : undefined}
          />
          {/* C1 — Profile shortcut beside the hamburger, mobile-only, signed-in only.
           *  Shows the user's initials so they can confirm who they're signed in as
           *  at a glance; tapping navigates directly to their dashboard. */}
          {isActiveSession ? (
            <Link
              href={headerHref(accountLink.href)}
              aria-label={`${mobileUserIdentity?.displayName ?? "Your account"} — go to dashboard`}
              className="md:hidden inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {mobileUserIdentity?.displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("") || <UserRound className="size-4" />}
            </Link>
          ) : null}
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link
              href={headerHref("/directory")}
              aria-label={t("public.header.searchTalentAria")}
            >
              <Search className="size-5" />
            </Link>
          </Button>
          {brandInLeftCol ? (
            <span className="ml-1 hidden min-w-0 md:inline-flex" data-brand-slot-wrap>
              {brandLink}
            </span>
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
            <span className="hidden min-w-0 md:inline-flex" data-brand-slot-wrap>
              {brandLink}
            </span>
          ) : null}
          {/* Mobile brand fallback — always visible <md, regardless of
           *  the chosen brand-position, so the bar never reads "where's
           *  the logo" on a phone. */}
          <span className="min-w-0 md:hidden" data-brand-slot-wrap>
            {brandLink}
          </span>
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
            <span className="mr-2 hidden min-w-0 md:inline-flex" data-brand-slot-wrap>
              {brandLink}
            </span>
          ) : null}
          {showCtaInDesktopBar ? (
            <Button
              size="sm"
              className={`mr-1 hidden md:inline-flex ${showCtaInMobileBar ? "sm:inline-flex" : ""}${ctaSafePairClass}`}
              asChild
            >
              <Link href={headerHref(ctaHref!)}>{ctaLabel!}</Link>
            </Button>
          ) : null}
          {showCtaInMobileBar && !showCtaInDesktopBar ? (
            <Button size="sm" className={`mr-1 inline-flex md:hidden${ctaSafePairClass}`} asChild>
              <Link href={headerHref(ctaHref!)}>{ctaLabel!}</Link>
            </Button>
          ) : null}
          {showAutoRegisterCta ? (
            <Button size="sm" className="mr-1 inline-flex" asChild>
              <OpenTenantRegisterButton ariaLabel={autoRegisterLabel}>
                {autoRegisterLabel}
              </OpenTenantRegisterButton>
            </Button>
          ) : null}
          <PublicLanguageToggle
            className="mr-1 hidden sm:flex"
            activeLocale={locale}
            pathnameWithoutLocale={pathnameWithoutLocale}
            availableLocales={tenantLocaleSettings.supportedLocales}
            defaultLocale={tenantLocaleSettings.defaultLocale}
            showLanguageSwitcher={tenantLocaleSettings.showLanguageSwitcher}
          />
          <PublicHeaderDiscoveryTools
            initialFavoritesCount={favoriteIds.length}
            initialCartCount={savedIds.length}
            directoryHeaderCopy={directoryHeaderCopy}
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
                    href={headerHref(accountLink.href)}
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
                    href: headerHref(accountLink.href),
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
                href={headerHref(accountLink.href)}
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
