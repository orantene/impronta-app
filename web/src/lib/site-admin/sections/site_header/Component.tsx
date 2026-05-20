import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { SiteHeaderV1 } from "./schema";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import { HeaderAuthArea } from "@/components/site-shell/HeaderAuthArea";
import { EditorialSplitActions } from "./EditorialSplitActions";
import { resolveShellBrandLogoUrl } from "@/lib/site-admin/server/shell-brand-logo";
import { resolveShellBrandTagline } from "@/lib/site-admin/server/shell-brand-tagline";
import {
  resolveShellSocialContact,
  type ShellSocialLink,
  type ShellContactLink,
} from "@/lib/site-admin/server/shell-social-contact";
import { headerContactHref } from "@/lib/site-admin/site-header/social-contact-normalize";
import type { Locale } from "@/i18n/config";
import { headers } from "next/headers";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { stripLocaleFromPathname, withLocalePath } from "@/i18n/pathnames";
import { publicLocaleHref } from "@/i18n/client-directory-href";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import { resolveAccountHref } from "@/lib/auth-flow";

/**
 * Phase 6B — the prototype `editorial-split` header has a bespoke right
 * zone (EN·ES + Saved + Inquiry + ☰ drawer) that the shared auth widgets
 * can't express. Resolve the SAME real destinations <HeaderAuthArea> uses
 * (no invented data) and hand them to the dedicated client surface.
 * Every other variant keeps <HeaderAuthArea> verbatim → zero regression.
 */
async function renderRightZone(
  variant: string | undefined,
  locale: Locale,
  primaryCta: { label: string; href: string; external?: boolean } | null,
  navItems: { label: string; href: string; external?: boolean }[],
  showAccount: boolean,
  showLanguage: boolean,
  showDiscovery: boolean,
) {
  if (variant !== "editorial-split") {
    return showAccount || showLanguage || showDiscovery ? (
      <HeaderAuthArea
        locale={locale}
        showAccountMenu={showAccount}
        showLanguageToggle={showLanguage}
        showDiscoveryTools={showDiscovery}
      />
    ) : null;
  }
  const h = await headers();
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);
  const actor = await getCachedActorSession();
  const account = resolveAccountHref(Boolean(actor.user), actor.profile);
  const [savedIds, favoriteIds] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
  ]);
  const isEs = locale === "es";
  return (
    <EditorialSplitActions
      localeHrefs={{
        en: withLocalePath(pathnameWithoutLocale, "en"),
        es: withLocalePath(pathnameWithoutLocale, "es"),
      }}
      activeLocale={locale}
      navItems={navItems}
      primaryCta={primaryCta}
      directoryHref={publicLocaleHref(pathnameWithoutLocale, "/directory", locale)}
      accountHref={account.href}
      accountLabel={account.label}
      savedCount={savedIds.length}
      favoritesCount={favoriteIds.length}
      copy={{
        menu: isEs ? "Menú" : "Menu",
        close: isEs ? "Cerrar" : "Close",
        saved: isEs ? "Guardados" : "Saved",
        inquiry: isEs ? "Tu solicitud" : "Your inquiry",
        startInquiry: isEs ? "Iniciar solicitud" : "Start an inquiry",
        exploreTalent: isEs ? "Explorar talento" : "Explore talent",
        language: isEs ? "Idioma" : "Language",
      }}
    />
  );
}

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

function headingSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.95rem";
  if (size === "lg") return "1.2rem";
  if (size === "xl") return "1.35rem";
  return undefined;
}

function ctaSize(size?: "sm" | "md" | "lg" | "xl"): Pick<CSSProperties, "padding" | "fontSize"> {
  if (size === "sm") return { padding: "0.5rem 0.85rem", fontSize: "0.84rem" };
  if (size === "lg") return { padding: "0.72rem 1.2rem", fontSize: "1rem" };
  if (size === "xl") return { padding: "0.8rem 1.35rem", fontSize: "1.03rem" };
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
        size?: "sm" | "md" | "lg" | "xl";
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
        size?: "sm" | "md" | "lg" | "xl";
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
        size?: "sm" | "md" | "lg" | "xl";
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
        size?: "sm" | "md" | "lg" | "xl";
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
 * Phase 6B — inline brand-neutral icons for the social/contact cluster.
 * `currentColor` so the active theme token paints them; no external icon
 * dependency, no tenant hardcoding. Unknown platforms fall back to a
 * generic "link" glyph rather than rendering nothing.
 */
/**
 * Icons lifted VERBATIM from the v11 prototype header (`.si` / `.ai`
 * SVGs) so the rendered cluster is pixel-faithful — WhatsApp/Instagram/
 * TikTok/phone are the prototype's exact markup (Instagram = rounded
 * rect + lens + flash dot; not a solid blob). Facebook/YouTube/LinkedIn/
 * X/email aren't in the prototype header, so they use clean glyphs in
 * the same register (24 view-box, currentColor). Stroke icons use the
 * prototype's 1.7 weight.
 */
function ClusterIcon({ name }: { name: string }) {
  const cls = "site-header__cluster-icon";
  const stroke = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };
  const solid = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
    focusable: "false" as const,
  };
  switch (name) {
    case "whatsapp":
      return (
        <svg {...solid}>
          <path d="M.06 24l1.69-6.16a11.87 11.87 0 01-1.59-5.95C.16 5.34 5.5 0 12.06 0a11.82 11.82 0 018.41 3.49 11.82 11.82 0 013.48 8.41c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 01-5.69-1.45L.06 24zM6.6 20.13c1.68 1 3.28 1.6 5.45 1.6 5.45 0 9.89-4.43 9.89-9.88a9.83 9.83 0 00-2.9-7 9.78 9.78 0 00-6.98-2.9c-5.46 0-9.9 4.44-9.9 9.89a9.82 9.82 0 001.51 5.26l-.99 3.6 3.92-1.02zm11.39-5.7c-.07-.12-.27-.2-.56-.34-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.29-.76.96-.94 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.34.44-.52.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.19-.24-.57-.48-.5-.66-.5l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.47s1.07 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...stroke}>
          <rect x="2" y="2" width="20" height="20" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...solid}>
          <path d="M16.5 1.5h-3v14.2a3.1 3.1 0 11-2.3-3v-3.1a6.2 6.2 0 105.3 6.1V8.4a7.3 7.3 0 004.3 1.4V6.7a4.3 4.3 0 01-4.3-4.3v-.9z" />
        </svg>
      );
    case "phone":
      return (
        <svg {...stroke}>
          <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.6a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" />
        </svg>
      );
    case "email":
      return (
        <svg {...stroke}>
          <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
          <path d="m3 6 9 6.5L21 6" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...solid}>
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...solid}>
          <path d="M22.5 7.1a2.7 2.7 0 0 0-1.9-1.9C18.9 4.7 12 4.7 12 4.7s-6.9 0-8.6.5A2.7 2.7 0 0 0 1.5 7.1 28 28 0 0 0 1 12a28 28 0 0 0 .5 4.9 2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 23 12a28 28 0 0 0-.5-4.9zM9.8 15.3V8.7l5.7 3.3z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...solid}>
          <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z" />
        </svg>
      );
    case "x":
      return (
        <svg {...solid}>
          <path d="M18.9 2h3.3l-7.2 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2l7.7-8.8L1.5 2h6.8l4.7 6.2zm-1.2 18h1.8L7.1 3.9H5.2z" />
        </svg>
      );
    default:
      return (
        <svg {...stroke}>
          <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 9a5 5 0 0 1-7 0 5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 0" />
        </svg>
      );
  }
}

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
    brand,
    brandDisplay,
    navItems,
    primaryCta,
    sticky,
    tone,
    variant,
    authArea,
    socialLinks,
    contactLinks,
    density,
    nodePresentation,
    presentation,
  } = props;
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
  const hasCluster = social.length > 0 || contacts.length > 0;
  // Density attrs are emitted ONLY when explicitly set, so a tenant that
  // never configured density keeps the verbatim existing CSS defaults.
  const densityAttrs: Record<string, string> = {};
  if (density?.logoScale) densityAttrs["data-logo-scale"] = density.logoScale;
  if (density?.navDensity) densityAttrs["data-nav-density"] = density.navDensity;
  if (density?.verticalPadding)
    densityAttrs["data-vpad"] = density.verticalPadding;
  if (density?.mobileMenuStyle)
    densityAttrs["data-mobile-menu"] = density.mobileMenuStyle;
  // 6C — single-source link resolution. Resolve nav + primary CTA once
  // here; renderRightZone / EditorialSplitActions keep their string-href
  // interface (resolved at this boundary → no client-component change,
  // minimal blast radius). Deep-prefixer leaves LinkRef.value alone +
  // prefixPublicHref is idempotent, so legacy + structured both resolve.
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const brandHref = resolveLinkLike(brand.href ?? "/", linkCtx).href;
  const navLinks = navItems.map((item) => {
    const L = resolveLinkLike(item.href, linkCtx);
    return {
      label: item.label,
      href: L.href,
      external: item.external || L.openInNew,
    };
  });
  const primaryCtaResolved = primaryCta
    ? (() => {
        const L = resolveLinkLike(primaryCta.href, linkCtx);
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
  const bd = brandDisplay ?? "image-and-text";
  const showBrandImage = (bd === "image" || bd === "image-and-text") && !!brandLogoUrl;
  const showBrandText = (bd === "text" || bd === "image-and-text") && !!brand.label;
  const showAccount = authArea?.showAccountMenu ?? true;
  const showLanguage = authArea?.showLanguageToggle ?? true;
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
  return (
    <header
      className="site-header"
      data-section-id={sectionId}
      data-section-type="site_header"
      data-variant={variant}
      data-tone={tone}
      data-sticky={sticky ? "true" : "false"}
      data-has-cluster={hasCluster ? "true" : "false"}
      {...densityAttrs}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? <style dangerouslySetInnerHTML={{ __html: responsiveCss }} /> : null}
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
        <div className="site-header__actions">
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
          )}
        </div>
      </div>
    </header>
  );
}
