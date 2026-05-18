import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { SiteHeaderV1 } from "./schema";
import { HeaderAuthArea } from "@/components/site-shell/HeaderAuthArea";
import { resolveShellBrandLogoUrl } from "@/lib/site-admin/server/shell-brand-logo";
import {
  resolveShellSocialContact,
  type ShellSocialLink,
  type ShellContactLink,
} from "@/lib/site-admin/server/shell-social-contact";
import type { Locale } from "@/i18n/config";

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
const CLUSTER_ICON_PATHS: Record<string, string> = {
  instagram:
    "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm5.5-3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z",
  tiktok:
    "M16 3c.4 2.5 1.9 4.2 4.4 4.5v3.1c-1.6.1-3-.4-4.4-1.3v6.2a6.2 6.2 0 1 1-6.2-6.2c.3 0 .6 0 1 .1v3.2c-.3-.1-.6-.1-1-.1a3 3 0 1 0 3 3V3h3.2z",
  facebook:
    "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z",
  youtube:
    "M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15V9l5.2 3z",
  linkedin:
    "M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3.3 8.5h3.3V21H3.3zM9.4 8.5h3.1v1.7h.05c.44-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V21h-3.3v-5.7c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.8H9.4z",
  x: "M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L6 22H3l7.5-8.6L2.5 2h6.6l4.5 6.6zm-1.1 18h1.7L7.1 4H5.3z",
  whatsapp:
    "M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.8-.6-3.1-1.3-5-4.4-5.2-4.6-.2-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .7.5l.9 2.1c.1.2.1.4 0 .6l-.4.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.8-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.3z",
  phone:
    "M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.3 1z",
  email:
    "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7L4 7v1l8 5 8-5V7z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 9a5 5 0 0 1-7 0 5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 0",
};

function ClusterIcon({ name }: { name: string }) {
  const path = CLUSTER_ICON_PATHS[name] ?? CLUSTER_ICON_PATHS.link;
  return (
    <svg
      className="site-header__cluster-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

/** Format an owner-provided contact value into a safe href. Never invents
 * data — only prefixes the scheme when the operator gave a bare value. */
function contactHref(type: "phone" | "email" | "whatsapp", value: string): string {
  const v = value.trim();
  if (type === "phone") return /^tel:/i.test(v) ? v : `tel:${v.replace(/[^\d+]/g, "")}`;
  if (type === "email") return /^mailto:/i.test(v) ? v : `mailto:${v}`;
  // whatsapp
  if (/^https?:\/\//i.test(v)) return v;
  return `https://wa.me/${v.replace(/[^\d]/g, "")}`;
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
  const brandHref = brand.href || "/";
  const brandLogoUrl = await resolveShellBrandLogoUrl({
    tenantId,
    brandLogoUrl: brand.logoUrl,
  });
  const bd = brandDisplay ?? "image-and-text";
  const showBrandImage = (bd === "image" || bd === "image-and-text") && !!brandLogoUrl;
  const showBrandText = (bd === "text" || bd === "image-and-text") && !!brand.label;
  const showAccount = authArea?.showAccountMenu ?? true;
  const showLanguage = authArea?.showLanguageToggle ?? true;
  const showDiscovery = authArea?.showDiscoveryTools ?? true;
  const hasAuthArea = showAccount || showLanguage || showDiscovery;
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
            {contacts.length > 0 ? (
              <div className="site-header__contacts">
                {contacts.map((c, i) => (
                  <a
                    key={`c${i}`}
                    className="site-header__contact"
                    href={contactHref(c.type, c.value)}
                    {...(c.type === "whatsapp"
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    <ClusterIcon name={c.type} />
                    <span className="site-header__contact-label">
                      {c.label ?? c.value}
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
            {social.length > 0 ? (
              <div className="site-header__socials">
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
              </div>
            ) : null}
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
        </a>
        {navItems.length > 0 ? (
          <nav className="site-header__nav" aria-label="Primary">
            <ul className="site-header__nav-list">
              {navItems.map((item, i) => (
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
          {primaryCta ? (
            <a
              className="site-header__cta site-btn site-btn--primary"
              href={primaryCta.href}
              target={primaryCta.external ? "_blank" : undefined}
              rel={primaryCta.external ? "noopener noreferrer" : undefined}
              data-builder-node-id={nodeIdsByRole?.primaryCta}
              style={ctaNodeStyle(primaryCtaNode)}
            >
              {primaryCta.label}
            </a>
          ) : null}
          {hasAuthArea ? (
            <HeaderAuthArea
              locale={locale as Locale}
              showAccountMenu={showAccount}
              showLanguageToggle={showLanguage}
              showDiscoveryTools={showDiscovery}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
