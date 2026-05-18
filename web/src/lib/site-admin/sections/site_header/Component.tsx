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
    navItems,
    primaryCta,
    sticky,
    tone,
    variant,
    authArea,
    nodePresentation,
    presentation,
  } = props;
  const brandHref = brand.href || "/";
  const brandLogoUrl = await resolveShellBrandLogoUrl({
    tenantId,
    brandLogoUrl: brand.logoUrl,
  });
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
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? <style dangerouslySetInnerHTML={{ __html: responsiveCss }} /> : null}
      <div className="site-header__inner">
        <a className="site-header__brand" href={brandHref}>
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="site-header__brand-mark"
              src={brandLogoUrl}
              alt={brand.logoAlt ?? brand.label ?? ""}
              loading="eager"
              decoding="sync"
            />
          ) : null}
          {brand.label ? (
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
    </header>
  );
}
