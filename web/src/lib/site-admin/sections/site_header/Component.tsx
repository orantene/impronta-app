import { HeaderDemoPill, HeaderSiteLocales, headerItemAttrs, headerItemMobileDefault } from "./header-site-chrome";
import { SectionSwitcher } from "./SectionSwitcher";
import { switcherLinksFrom, withSwitcherHome } from "./section-switcher-logic";
import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { SiteHeaderV1, HeaderItem } from "./schema";
import { HeaderRegionLiveCount } from "./HeaderRegionLiveCount";
import { HeaderHeightVar } from "./HeaderHeightVar";
import { HeaderScrollObserver } from "./HeaderScrollObserver";
import { NavChromeScrollSpy } from "@/lib/site-admin/builder-node/NavChromeScrollSpy";
import { navChromeNeedsScrollSpy, normalizeNavChrome } from "@/lib/site-admin/nav-chrome";
import { ClusterIcon } from "./header-cluster-icon";
import { HeaderAccountItem } from "./HeaderAccountItem";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import { resolveShellBrandLogoUrl } from "@/lib/site-admin/server/shell-brand-logo";
import { resolveShellBrandTagline } from "@/lib/site-admin/server/shell-brand-tagline";
import {
  resolveShellSocialContact,
  type ShellSocialLink,
  type ShellContactLink,
} from "@/lib/site-admin/server/shell-social-contact";
import { headerContactHref } from "@/lib/site-admin/site-header/social-contact-normalize";
import type { Locale } from "@/i18n/config";
import {
  loadTenantLocaleSettings,
} from "@/lib/site-admin/server/locale-resolver";
import { resolveWorkspaceType } from "@/lib/saas/assert-roster-workspace";
import { rosterEnabled } from "@/lib/saas/workspace-type";
import {
  directoryOrBookHref,
  filterNavItemsForRoster,
  resolveRosterSafeHref,
} from "./directory-nav-href";
import { renderRightZone } from "./EditorialSplitRightZone";

function textAlignFor(align?: "left" | "center" | "right"): CSSProperties["textAlign"] {
  if (align === "left") return "left";
  if (align === "right") return "right";
  if (align === "center") return "center";
  return undefined;
}

function textToneColor(tone?: "default" | "muted" | "strong"): CSSProperties["color"] {
  if (tone === "muted") return "var(--token-color-muted)";
  if (tone === "strong") return "var(--foreground)";
  return undefined;
}

function headingSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.95rem";
  if (size === "lg") return "1.2rem";
  if (size === "xl") return "1.35rem";
  if (size === "display") return "clamp(3.5rem, 6vw, 6rem)";
  return undefined;
}

function ctaSize(size?: "sm" | "md" | "lg" | "xl" | "display"): Pick<CSSProperties, "padding" | "fontSize"> {
  if (size === "sm") return { padding: "0.5rem 0.85rem", fontSize: "0.84rem" };
  if (size === "lg") return { padding: "0.72rem 1.2rem", fontSize: "1rem" };
  if (size === "xl") return { padding: "0.8rem 1.35rem", fontSize: "1.03rem" };
  if (size === "display") return { padding: "0.8rem 1.35rem", fontSize: "1.03rem" };
  return {};
}

function visibilityDisplay(visibility?: "visible" | "hidden"): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

function toCssDecls(style: CSSProperties): string[] {
  const decls: string[] = [];
  if (style.textAlign) decls.push(`text-align:${style.textAlign}`);
  if (style.maxWidth) decls.push(`max-width:${style.maxWidth}`);
  if (style.marginTop) decls.push(`margin-top:${style.marginTop}`);
  if (style.marginBottom) decls.push(`margin-bottom:${style.marginBottom}`);
  if (style.marginInline) decls.push(`margin-inline:${style.marginInline}`);
  if (style.marginLeft) decls.push(`margin-left:${style.marginLeft}`);
  if (style.marginRight) decls.push(`margin-right:${style.marginRight}`);
  if (style.paddingTop) decls.push(`padding-top:${style.paddingTop}`);
  if (style.paddingBottom) decls.push(`padding-bottom:${style.paddingBottom}`);
  if (style.paddingInline) decls.push(`padding-inline:${style.paddingInline}`);
  if (style.paddingLeft) decls.push(`padding-left:${style.paddingLeft}`);
  if (style.paddingRight) decls.push(`padding-right:${style.paddingRight}`);
  if (style.fontSize) decls.push(`font-size:${style.fontSize}`);
  if (style.color) decls.push(`color:${style.color}`);
  if (style.display) decls.push(`display:${style.display}`);
  return decls;
}

function textNodeStyle(
  node:
    | {
        align?: "left" | "center" | "right";
        maxWidthPx?: number;
        marginTopPx?: number;
        marginBottomPx?: number;
        marginInlinePx?: number;
        marginLeftPx?: number;
        marginRightPx?: number;
        paddingTopPx?: number;
        paddingBottomPx?: number;
        paddingInlinePx?: number;
        paddingLeftPx?: number;
        paddingRightPx?: number;
        size?: "sm" | "md" | "lg" | "xl" | "display";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
): CSSProperties {
  return {
    display: visibilityDisplay(node?.visibility) ?? "inline-block",
    textAlign: textAlignFor(node?.align),
    maxWidth: node?.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    marginTop: typeof node?.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node?.marginBottomPx === "number" ? `${node.marginBottomPx}px` : undefined,
    marginInline:
      typeof node?.marginLeftPx !== "number" &&
      typeof node?.marginRightPx !== "number" &&
      typeof node?.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft: typeof node?.marginLeftPx === "number" ? `${node.marginLeftPx}px` : undefined,
    marginRight: typeof node?.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop: typeof node?.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
    paddingBottom:
      typeof node?.paddingBottomPx === "number" ? `${node.paddingBottomPx}px` : undefined,
    paddingInline:
      typeof node?.paddingLeftPx !== "number" &&
      typeof node?.paddingRightPx !== "number" &&
      typeof node?.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft: typeof node?.paddingLeftPx === "number" ? `${node.paddingLeftPx}px` : undefined,
    paddingRight:
      typeof node?.paddingRightPx === "number" ? `${node.paddingRightPx}px` : undefined,
    fontSize: headingSize(node?.size),
    color: textToneColor(node?.tone),
  };
}

function ctaNodeStyle(
  node:
    | {
        size?: "sm" | "md" | "lg" | "xl" | "display";
        marginTopPx?: number;
        marginBottomPx?: number;
        marginInlinePx?: number;
        marginLeftPx?: number;
        marginRightPx?: number;
        paddingTopPx?: number;
        paddingBottomPx?: number;
        paddingInlinePx?: number;
        paddingLeftPx?: number;
        paddingRightPx?: number;
        visibility?: "visible" | "hidden";
      }
    | undefined,
): CSSProperties {
  return {
    ...ctaSize(node?.size),
    marginTop: typeof node?.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node?.marginBottomPx === "number" ? `${node.marginBottomPx}px` : undefined,
    marginInline:
      typeof node?.marginLeftPx !== "number" &&
      typeof node?.marginRightPx !== "number" &&
      typeof node?.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft: typeof node?.marginLeftPx === "number" ? `${node.marginLeftPx}px` : undefined,
    marginRight: typeof node?.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop: typeof node?.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
    paddingBottom:
      typeof node?.paddingBottomPx === "number" ? `${node.paddingBottomPx}px` : undefined,
    paddingInline:
      typeof node?.paddingLeftPx !== "number" &&
      typeof node?.paddingRightPx !== "number" &&
      typeof node?.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft: typeof node?.paddingLeftPx === "number" ? `${node.paddingLeftPx}px` : undefined,
    paddingRight:
      typeof node?.paddingRightPx === "number" ? `${node.paddingRightPx}px` : undefined,
    display: visibilityDisplay(node?.visibility),
  };
}

function textNodeDecls(
  node:
    | {
        align?: "left" | "center" | "right";
        maxWidthPx?: number;
        marginTopPx?: number;
        marginBottomPx?: number;
        marginInlinePx?: number;
        marginLeftPx?: number;
        marginRightPx?: number;
        paddingTopPx?: number;
        paddingBottomPx?: number;
        paddingInlinePx?: number;
        paddingLeftPx?: number;
        paddingRightPx?: number;
        size?: "sm" | "md" | "lg" | "xl" | "display";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
): string[] {
  if (!node) return [];
  return toCssDecls(textNodeStyle(node));
}

function ctaDecls(
  node:
    | {
        size?: "sm" | "md" | "lg" | "xl" | "display";
        marginTopPx?: number;
        marginBottomPx?: number;
        marginInlinePx?: number;
        marginLeftPx?: number;
        marginRightPx?: number;
        paddingTopPx?: number;
        paddingBottomPx?: number;
        paddingInlinePx?: number;
        paddingLeftPx?: number;
        paddingRightPx?: number;
        visibility?: "visible" | "hidden";
      }
    | undefined,
): string[] {
  if (!node) return [];
  return toCssDecls(ctaNodeStyle(node));
}

/**
 * Phase 6B: inline brand-neutral icons for the social/contact cluster (`currentColor`, no external icon
 * dependency; unknown platforms fall back to a generic "link" glyph). WhatsApp/Instagram/TikTok/phone are
 * lifted verbatim from the v11 prototype header (pixel-faithful); Facebook/YouTube/LinkedIn/X/email use
 * clean glyphs in the same register (24 view-box, stroke weight 1.7).
 *
 */
// ClusterIcon moved to ./header-cluster-icon (shared by the classic cluster +
// the WF-5 freeform region items; also keeps this file under the line cap).

/**
 * Phase B — public renderer for site_header sections.
 *
 * Rendered as the header slot of a tenant's site_shell row when the
 * snapshot-shell feature flag is on AND the tenant has a published shell.
 * Tenants without a shell continue to render the hard-coded `PublicHeader`.
 */
export async function SiteHeaderComponent({
  props,
  sectionId,
  tenantId,
  locale,
  publicPathPrefix = "",
  builderNodeBindings,
}: SectionComponentProps<SiteHeaderV1>) {
  const {
    brand = {},
    brandDisplay,
    navItems,
    primaryCta,
    sticky,
    tone,
    scrollTone,
    scrollThresholdPx,
    variant,
    navChrome: navChromeRaw,
    authArea,
    socialLinks,
    contactLinks,
    density,
    nodePresentation,
    presentation,
  } = props;
  const navChrome = normalizeNavChrome(navChromeRaw);
  // Phase 6B — explicit section-prop links win; otherwise fall back to
  // the canonical identity store (what the operator edits in the
  // inspector's "Social & contact" area). Empty everywhere = nothing
  // rendered = existing tenants visually unchanged.
  const { socialLinks: social, contactLinks: contacts } =
    await resolveShellSocialContact({
      tenantId,
      explicitSocial:
        (socialLinks ?? []).length > 0
          ? (socialLinks as { platform: ShellSocialLink["platform"]; href: string }[])
          : null,
      explicitContact:
        (contactLinks ?? []).length > 0
          ? (contactLinks as { type: ShellContactLink["type"]; value: string }[])
          : null,
    });
  // TUL-240: a paid Web Office site's own links feed the header `social` item (render-time `siteChrome`).
  const itemSocial = props.siteChrome?.social?.length ? props.siteChrome.social : social;
  const hasCluster = social.length > 0 || contacts.length > 0;
  // Density attrs only when set (unset = existing CSS defaults).
  const densityAttrs: Record<string, string> = {};
  if (density?.logoScale) densityAttrs["data-logo-scale"] = density.logoScale;
  if (density?.navDensity) densityAttrs["data-nav-density"] = density.navDensity;
  if (density?.verticalPadding) densityAttrs["data-vpad"] = density.verticalPadding;
  if (density?.mobileMenuStyle) densityAttrs["data-mobile-menu"] = density.mobileMenuStyle;
  const scrollSpy = navChromeNeedsScrollSpy(navChrome) ? (
    <NavChromeScrollSpy />
  ) : null;
  // 6C — resolve nav + CTA once; LinkRef + prefixPublicHref stay idempotent.
  // TUL-519 card 77: business workspaces 404 on /directory, so drop those
  // nav items and fall CTAs back to /book at render time (seeded + authored).
  const hasRoster = rosterEnabled(await resolveWorkspaceType(tenantId));
  const inquiryFallback = directoryOrBookHref(hasRoster);
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const brandHref = resolveLinkLike(brand.href ?? "/", linkCtx).href;
  const navLinks = filterNavItemsForRoster(
    navItems.map((item) => {
      const L = resolveLinkLike(item.href, linkCtx);
      return {
        label: item.label,
        href: L.href,
        external: item.external || L.openInNew,
      };
    }),
    hasRoster,
  );
  const primaryCtaResolved = primaryCta
    ? (() => {
        const L = resolveLinkLike(
          resolveRosterSafeHref(primaryCta.href, hasRoster, inquiryFallback),
          linkCtx,
        );
        return {
          label: primaryCta.label,
          href: L.href,
          external: primaryCta.external || L.openInNew,
        };
      })()
    : null;
  const brandLogoUrl = await resolveShellBrandLogoUrl({
    tenantId,
    brandLogoUrl: brand.logoUrl,
  });
  // Sub-wordmark line: explicit section override wins, else the canonical
  // agency_business_identity.tagline the inspector Brand tab already edits
  // (same pattern as social/contact + logo — no parallel store).
  const brandTagline = await resolveShellBrandTagline({
    tenantId,
    brandTagline: brand.tagline,
  });
  // For tenant hosts: use the tenant's locale settings.
  // For platform/no-tenant context: `loadTenantLocaleSettings("")` returns the
  // platform fallback (single "en", switcher hidden) which is safe here since
  // the site_header section only renders for tenant snapshots.
  const tenantLocaleSettings = await loadTenantLocaleSettings(tenantId ?? "");
  const bd = brandDisplay ?? "image-and-text";
  const showBrandImage = (bd === "image" || bd === "image-and-text") && !!brandLogoUrl;
  const showBrandText = (bd === "text" || bd === "image-and-text") && !!brand.label;
  const showAccount = authArea?.showAccountMenu ?? true;
  const showLanguage =
    (authArea?.showLanguageToggle ?? true) &&
    tenantLocaleSettings.showLanguageSwitcher &&
    tenantLocaleSettings.supportedLocales.length > 1;
  const showDiscovery = authArea?.showDiscoveryTools ?? true;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const headlineNode = nodePresentation?.headline;
  const primaryCtaNode = nodePresentation?.primaryCta;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-header__brand-label",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile),
      },
      {
        selector: ".site-header__cta",
        tablet: ctaDecls(primaryCtaNode?.breakpoints?.tablet),
        mobile: ctaDecls(primaryCtaNode?.breakpoints?.mobile),
      },
    ],
  });
  // Phase 6B — selection wiring lives in the generic section wrapper
  // (homepage-cms-sections.tsx), which special-cases site_header to emit
  // the synthetic SITE_HEADER_SELECTION_ID + no builder-node-id so the
  // navigator/canvas route to <SiteHeaderInspector>. The Component itself
  // stays a clean <header> (no extra wrapper → no duplicate nav row).

  // ── WF-5: fully freeform header (left / center / right regions) ──────────
  // When `regions` is set the owner has composed arbitrary items into zones,
  // each with per-breakpoint responsive behaviour. Self-contained branch — the
  // classic variant layout below is untouched (no regression). Items reference
  // the existing resolved config (brand / navLinks / social / contacts /
  // primaryCta), so there is no duplicate content store.
  const regions = props.regions;
  const demoPill = <HeaderDemoPill show={props.siteChrome?.demo} />; // demo talents' only marker
  const siteLocales = props.siteChrome?.locales ?? []; // talent site languages, links to this page per locale
  if (regions) {
    const renderItem = (item: HeaderItem, idx: number) => {
      const attrs = headerItemAttrs(item);
      const key = `${item.type}-${idx}`;
      switch (item.type) {
        case "wordmark":
          return brand.label ? (
            <a key={key} {...attrs} className="site-header__ritem site-header__brand" href={brandHref}>
              <span className="site-header__brand-label">{brand.label}</span>
              {brandTagline ? <span className="site-header__brand-tagline">{brandTagline}</span> : null}
            </a>
          ) : null;
        case "logo":
          return brandLogoUrl ? (
            <a key={key} {...attrs} className="site-header__ritem site-header__brand" href={brandHref}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="site-header__brand-mark" src={brandLogoUrl} alt={brand.logoAlt ?? brand.label ?? ""} loading="eager" decoding="sync" />
            </a>
          ) : null;
        case "nav":
          return navLinks.length > 0 ? (
            <nav key={key} {...attrs} className="site-header__ritem site-header__nav" aria-label="Primary">
              <ul className="site-header__nav-list">
                {navLinks.map((l, i) => (
                  <li key={i} className="site-header__nav-item">
                    <a className="site-header__nav-link" href={l.href} target={l.external ? "_blank" : undefined} rel={l.external ? "noopener noreferrer" : undefined}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null;
        case "cta": {
          const label = item.label ?? primaryCtaResolved?.label ?? "Inquire";
          const href = resolveRosterSafeHref(
            item.href ?? primaryCtaResolved?.href,
            hasRoster,
            inquiryFallback,
          );
          return (
            <a key={key} {...attrs} className="site-header__ritem site-header__cta site-btn site-btn--primary" href={href}>{label}</a>
          );
        }
        case "social": {
          // WF-6 — an explicit `platforms` list picks WHICH links show and in
          // what order. Unset (every pre-WF-6 value) falls through to the full
          // configured list, unchanged. A platform the tenant hasn't filled in
          // is skipped rather than rendered as a dead icon.
          const socialShown = item.platforms?.length
            ? item.platforms.flatMap(
                (p) => itemSocial.filter((s) => s.platform === p),
              )
            : itemSocial;
          return socialShown.length > 0 ? (
            <div key={key} {...attrs} className="site-header__ritem site-header__ritem-social">
              {socialShown.map((s, i) => (
                <a key={i} className="site-header__social" href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label ?? s.platform} title={s.label ?? s.platform}><ClusterIcon name={s.platform} /></a>
              ))}
            </div>
          ) : null;
        }
        case "phone": {
          const phone = contacts.find((c) => c.type === "phone");
          if (!phone) return null;
          const href = headerContactHref("phone", phone.value);
          return href ? (
            <a key={key} {...attrs} className="site-header__ritem site-header__contact" data-contact-type="phone" href={href} aria-label={phone.label ?? "Phone"}>
              <ClusterIcon name="phone" />
              <span className="site-header__contact-label">{(phone.label ?? phone.value).replace(/^tel:/i, "")}</span>
            </a>
          ) : null;
        }
        case "inquiry": {
          const href = resolveRosterSafeHref(item.href, hasRoster, inquiryFallback);
          return (
            <a key={key} {...attrs} className="site-header__ritem site-header__inquiry" href={href} aria-label="Your inquiry">
              <ClusterIcon name="inquiry" />
              {item.showCount === false ? null : <HeaderRegionLiveCount kind="saved" />}
            </a>
          );
        }
        case "saved": {
          const href = resolveRosterSafeHref(item.href, hasRoster, inquiryFallback);
          return (
            <a key={key} {...attrs} className="site-header__ritem site-header__saved" href={href} aria-label="Saved">
              <ClusterIcon name="saved" />
              <HeaderRegionLiveCount kind="favorites" />
            </a>
          );
        }
        case "language":
          if (siteLocales.length > 1) return <HeaderSiteLocales key={key} locales={siteLocales} hrefs={props.siteChrome?.hrefs} locale={locale} attrs={attrs} />;
          return tenantLocaleSettings.supportedLocales.length > 1 ? (
            <div key={key} {...attrs} className="site-header__ritem site-header__lang">
              {tenantLocaleSettings.supportedLocales.map((code) => (
                <span key={code} className="site-header__lang-code" data-active={code === locale ? "" : undefined}>{code.toUpperCase()}</span>
              ))}
            </div>
          ) : null;
        case "account":
          return props.siteChrome?.account ? <HeaderAccountItem key={key} attrs={attrs} locale={locale} /> : null;
        case "section_switcher": {
          // H-4: phone section switcher over the in-page links of the Navigation list.
          const own = switcherLinksFrom(navLinks);
          const hashLinks = own.length > 0 ? withSwitcherHome(own, pickLocale(locale, { en: "Home", es: "Inicio" })) : own;
          return hashLinks.length > 1 ? (
            <SectionSwitcher key={key} links={hashLinks} showIndex={item.showIndex !== false} label={pickLocale(locale, { en: "Sections", es: "Secciones" })} attrs={attrs} />
          ) : null;
        }
        case "spacer":
          return <span key={key} {...attrs} className="site-header__ritem site-header__spacer" aria-hidden />;
        default:
          return null;
      }
    };
    const allItems = [...regions.left, ...regions.center, ...regions.right];
    // Burger + panel only when an item actually folds into it on the phone.
    const hasMobileMenu = allItems.some((i) => (i.responsive?.mobile ?? headerItemMobileDefault(i)) === "menu");
    return (
      <header
        className="site-header"
        data-section-id={sectionId}
        data-section-type="site_header"
        data-variant="freeform"
        data-tone={tone}
        data-sticky={sticky ? "true" : "false"}
        data-nav-chrome={navChrome}
        {...(scrollTone ? { "data-scroll-tone": scrollTone } : {})}
        {...densityAttrs}
        {...presentationDataAttrs(presentation)}
        style={presentationInlineStyles(presentation)}
      >
        {responsiveCss ? <style dangerouslySetInnerHTML={{ __html: responsiveCss }} /> : null}
        {scrollTone ? (
          <HeaderScrollObserver thresholdPx={scrollThresholdPx ?? 40} />
        ) : null}
        {scrollSpy}
        <HeaderHeightVar />
        <div className="site-header__inner site-header__inner--freeform">
          <div className="site-header__region" data-region="left">{regions.left.map(renderItem)}</div>
          <div className="site-header__region" data-region="center">{regions.center.map(renderItem)}</div>
          <div className="site-header__region" data-region="right">{demoPill}{regions.right.map(renderItem)}</div>
          {hasMobileMenu ? <input type="checkbox" id={`${sectionId}-menu`} className="site-header__menu-toggle" aria-hidden="true" tabIndex={-1} /> : null}
          {hasMobileMenu ? <label htmlFor={`${sectionId}-menu`} className="site-header__burger" aria-label="Menu"><span /><span /><span /></label> : null}
        </div>
        {hasMobileMenu ? <div className="site-header__mobile-panel" data-mobile-panel="">{allItems.filter((i) => i.type !== "section_switcher").map((item, i) => renderItem(item, i))}</div> : null}
      </header>
    );
  }

  return (
    <header
      className="site-header"
      data-section-id={sectionId}
      data-section-type="site_header"
      data-variant={variant}
      data-tone={tone}
      data-sticky={sticky ? "true" : "false"}
      data-nav-chrome={navChrome}
      data-has-cluster={hasCluster ? "true" : "false"}
      {...(scrollTone ? { "data-scroll-tone": scrollTone } : {})}
      {...densityAttrs}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? <style dangerouslySetInnerHTML={{ __html: responsiveCss }} /> : null}
      {/* Scroll-to-solid observer; mounts only when scrollTone is set. */}
      {scrollTone ? (
        <HeaderScrollObserver thresholdPx={scrollThresholdPx ?? 40} />
      ) : null}
      {scrollSpy}
      <div className="site-header__inner">
        {hasCluster ? (
          <div className="site-header__cluster" data-cluster-zone="lead">
            {/* Prototype cluster ORDER: WhatsApp (messaging) → social
                platforms → email → phone LAST (the only one with a
                visible label). Icon-only otherwise; never dumps a raw
                URL as text. Order matches v11 regardless of which
                channels a tenant actually configured. */}
            {(() => {
              const renderContact = (
                c: (typeof contacts)[number],
                key: string,
              ) => {
                const isPhone = c.type === "phone";
                const href = headerContactHref(c.type, c.value);
                if (!href) return null;
                return (
                  <a
                    key={key}
                    className="site-header__contact"
                    data-contact-type={c.type}
                    href={href}
                    aria-label={
                      c.label ??
                      (c.type === "whatsapp"
                        ? "WhatsApp"
                        : c.type === "email"
                          ? "Email"
                          : "Phone")
                    }
                    title={
                      c.label ??
                      (isPhone
                        ? c.value
                        : c.type === "whatsapp"
                          ? "WhatsApp"
                          : "Email")
                    }
                    {...(c.type === "whatsapp"
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    <ClusterIcon name={c.type} />
                    {isPhone ? (
                      <span className="site-header__contact-label">
                        {(c.label ?? c.value).replace(/^tel:/i, "")}
                      </span>
                    ) : null}
                  </a>
                );
              };
              const wa = contacts.filter((c) => c.type === "whatsapp");
              const email = contacts.filter((c) => c.type === "email");
              const phone = contacts.filter((c) => c.type === "phone");
              return (
                <>
                  {wa.map((c, i) => renderContact(c, `wa${i}`))}
                  {social.map((s, i) => (
                    <a
                      key={`s${i}`}
                      className="site-header__social"
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label ?? s.platform}
                      title={s.label ?? s.platform}
                    >
                      <ClusterIcon name={s.platform} />
                    </a>
                  ))}
                  {email.map((c, i) => renderContact(c, `em${i}`))}
                  {phone.map((c, i) => renderContact(c, `ph${i}`))}
                </>
              );
            })()}
          </div>
        ) : null}
        <a className="site-header__brand" href={brandHref}>
          {showBrandImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="site-header__brand-mark"
              src={brandLogoUrl}
              alt={brand.logoAlt ?? brand.label ?? ""}
              loading="eager"
              decoding="sync"
            />
          ) : null}
          {showBrandText && brand.label ? (
            <span
              className="site-header__brand-label"
              data-builder-node-id={nodeIdsByRole?.headline}
              style={textNodeStyle(headlineNode)}
            >
              {brand.label}
            </span>
          ) : null}
          {showBrandText && brandTagline ? (
            <span className="site-header__brand-tagline">{brandTagline}</span>
          ) : null}
        </a>
        {navLinks.length > 0 ? (
          <nav className="site-header__nav" aria-label="Primary">
            <ul className="site-header__nav-list">
              {navLinks.map((item, i) => (
                <li key={i} className="site-header__nav-item">
                  <a
                    className="site-header__nav-link"
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {/* Phase 6B — right-zone group. `display:contents` by default so
            standard / minimal / split / editorial keep their exact prior
            flat layout; editorial-split promotes it to a real flex zone
            so the brand stays optically centred. */}
        <div className="site-header__actions">{demoPill}
          {/* The v11 prototype's top bar has NO inline CTA — "Start an
              Inquiry" lives in the hero + the ☰ drawer, keeping the
              wordmark dead-centre with air around it. So for
              editorial-split we suppress the inline chip (the affordance
              is preserved in the drawer + nav). Every other variant keeps
              the inline CTA exactly as before. */}
          {primaryCtaResolved && variant !== "editorial-split" ? (
            <a
              className="site-header__cta site-btn site-btn--primary"
              href={primaryCtaResolved.href}
              target={primaryCtaResolved.external ? "_blank" : undefined}
              rel={
                primaryCtaResolved.external
                  ? "noopener noreferrer"
                  : undefined
              }
              data-builder-node-id={nodeIdsByRole?.primaryCta}
              style={ctaNodeStyle(primaryCtaNode)}
            >
              {primaryCtaResolved.label}
            </a>
          ) : null}
          {await renderRightZone(
            variant,
            locale as Locale,
            primaryCtaResolved,
            navLinks,
            showAccount,
            showLanguage,
            showDiscovery,
            tenantLocaleSettings,
            inquiryFallback,
          )}
        </div>
      </div>
    </header>
  );
}
