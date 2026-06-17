import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { SiteFooterV1 } from "./schema";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import { resolveShellBrandLogoUrl } from "@/lib/site-admin/server/shell-brand-logo";

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
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.86rem";
  if (size === "lg") return "1rem";
  if (size === "xl") return "1.1rem";
  return undefined;
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
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl" | "display") => CSSProperties["fontSize"],
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
    fontSize: sizeMapper(node?.size),
    color: textToneColor(node?.tone),
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
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl" | "display") => CSSProperties["fontSize"],
): string[] {
  if (!node) return [];
  return toCssDecls(textNodeStyle(node, sizeMapper));
}

/**
 * Phase B.1 — public renderer for site_footer sections.
 *
 * Rendered exclusively as the footer slot of a tenant's site_shell row when
 * the snapshot-shell feature flag is on AND the tenant has a published
 * shell.
 */
export async function SiteFooterComponent({
  props,
  sectionId,
  tenantId,
  publicPathPrefix = "",
  builderNodeBindings,
}: SectionComponentProps<SiteFooterV1>) {
  const { brand, brandDisplay, columns, social, legal, variant, tone, nodePresentation, presentation } = props;
  // 6C — single-source link resolution (LinkRef object or legacy
  // string). Deep-prefixer leaves LinkRef.value alone; prefixPublicHref
  // is idempotent, so legacy + structured both resolve correctly.
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const brandLogoUrl = await resolveShellBrandLogoUrl({
    tenantId,
    brandLogoUrl: brand.logoUrl,
  });
  // Mirror site_header.brandDisplay — lets a tenant whose logo asset
  // already bakes the wordmark render logo-only (no duplicate stacked
  // wordmark). Default `image-and-text` = unchanged for every tenant.
  const bd = brandDisplay ?? "image-and-text";
  const showFooterImage = (bd === "image" || bd === "image-and-text") && !!brandLogoUrl;
  const showFooterText = bd === "text" || bd === "image-and-text";
  const hasColumns = columns.length > 0;
  const hasSocial = social.length > 0;
  const hasLegal = Boolean(legal.copyright?.trim()) || legal.links.length > 0;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const headlineNode = nodePresentation?.headline;
  const copyNode = nodePresentation?.copy;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-footer__brand-label",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet, headingSize),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile, headingSize),
      },
      {
        selector: ".site-footer__tagline",
        tablet: textNodeDecls(copyNode?.breakpoints?.tablet, paragraphSize),
        mobile: textNodeDecls(copyNode?.breakpoints?.mobile, paragraphSize),
      },
    ],
  });

  return (
    <footer
      className="site-footer"
      data-section-id={sectionId}
      data-section-type="site_footer"
      data-variant={variant}
      data-tone={tone}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? <style dangerouslySetInnerHTML={{ __html: responsiveCss }} /> : null}
      <div className="site-footer__inner">
        {(showFooterImage || (showFooterText && (brand.label || brand.tagline))) ? (
          <div className="site-footer__brand">
            {showFooterImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="site-footer__brand-mark"
                src={brandLogoUrl}
                alt={brand.logoAlt ?? brand.label ?? ""}
                loading="lazy"
                decoding="async"
              />
            ) : null}
            {showFooterText && brand.label ? (
              <span
                className="site-footer__brand-label"
                data-builder-node-id={nodeIdsByRole?.headline}
                style={textNodeStyle(headlineNode, headingSize)}
                suppressHydrationWarning
              >
                {brand.label}
              </span>
            ) : null}
            {showFooterText && brand.tagline ? (
              <p
                className="site-footer__tagline"
                data-builder-node-id={nodeIdsByRole?.copy}
                style={textNodeStyle(copyNode, paragraphSize)}
                suppressHydrationWarning
              >
                {brand.tagline}
              </p>
            ) : null}
          </div>
        ) : null}
        {hasColumns ? (
          <div className="site-footer__columns">
            {columns.map((col, i) => (
              <div key={i} className="site-footer__column" suppressHydrationWarning>
                <h3 className="site-footer__column-heading" suppressHydrationWarning>
                  {col.heading}
                </h3>
                <ul className="site-footer__column-list">
                  {col.links.map((link, j) => {
                    const L = resolveLinkLike(link.href, linkCtx);
                    const newTab = link.external || L.openInNew;
                    return (
                      <li key={j} className="site-footer__column-item">
                        <a
                          className="site-footer__column-link"
                          href={L.href}
                          target={newTab ? "_blank" : undefined}
                          rel={newTab ? "noopener noreferrer" : undefined}
                          suppressHydrationWarning
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
        {hasSocial ? (
          <ul className="site-footer__social" aria-label="Social links">
            {social.map((s, i) => (
              <li key={i} className="site-footer__social-item">
                <a
                  className="site-footer__social-link"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-platform={s.platform}
                  aria-label={s.platform}
                >
                  {s.platform}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {hasLegal ? (
          <div className="site-footer__legal">
            {legal.copyright ? (
              <span className="site-footer__copyright">{legal.copyright}</span>
            ) : null}
            {legal.links.length > 0 ? (
              <ul className="site-footer__legal-list">
                {legal.links.map((link, i) => {
                  const L = resolveLinkLike(link.href, linkCtx);
                  const newTab = link.external || L.openInNew;
                  return (
                    <li key={i} className="site-footer__legal-item">
                      <a
                        className="site-footer__legal-link"
                        href={L.href}
                        target={newTab ? "_blank" : undefined}
                        rel={newTab ? "noopener noreferrer" : undefined}
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
