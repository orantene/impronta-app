import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { FeaturedTalentV1 } from "./schema";
import { fetchFeaturedTalentForSection } from "./fetch";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { FeaturedTalentCard } from "./FeaturedTalentCard";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import type { CSSProperties } from "react";

import "./featured-talent.css";

function textAlignFor(align?: "left" | "center" | "right"): CSSProperties["textAlign"] {
  if (align === "left") return "left";
  if (align === "right") return "right";
  if (align === "center") return "center";
  return undefined;
}

function textToneColor(
  tone?: "default" | "muted" | "strong",
): CSSProperties["color"] {
  if (tone === "muted") return "var(--token-color-muted)";
  if (tone === "strong") return "var(--foreground)";
  return undefined;
}

function headingSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(1.55rem, 3.3vw, 2.4rem)";
  if (size === "lg") return "clamp(2.1rem, 4.8vw, 3.4rem)";
  if (size === "xl") return "clamp(2.4rem, 5.6vw, 3.9rem)";
  if (size === "display") return "clamp(3.5rem, 6vw, 6rem)";
  return undefined;
}

function eyebrowSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.66rem";
  if (size === "lg") return "0.84rem";
  if (size === "xl" || size === "display") return "0.92rem";
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.95rem";
  if (size === "lg") return "1.1rem";
  if (size === "xl") return "1.2rem";
  if (size === "display") return "clamp(2rem, 4vw, 4.5rem)";
  return undefined;
}

function visibilityDisplay(visibility?: "visible" | "hidden"): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

function buttonSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties {
  if (size === "sm") return { padding: "0.5rem 0.85rem", fontSize: "0.78rem" };
  if (size === "lg") return { padding: "0.72rem 1.08rem", fontSize: "0.9rem" };
  if (size === "xl" || size === "display") return { padding: "0.82rem 1.2rem", fontSize: "0.94rem" };
  return {};
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
  if (style.padding) decls.push(`padding:${style.padding}`);
  if (style.alignSelf) decls.push(`align-self:${style.alignSelf}`);
  if (style.display) decls.push(`display:${style.display}`);
  return decls;
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
  const hasMarginSides =
    typeof node.marginLeftPx === "number" ||
    typeof node.marginRightPx === "number";
  const hasPaddingSides =
    typeof node.paddingLeftPx === "number" ||
    typeof node.paddingRightPx === "number";
  return toCssDecls({
    textAlign: textAlignFor(node.align),
    maxWidth: node.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    marginTop: typeof node.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node.marginBottomPx === "number"
        ? `${node.marginBottomPx}px`
        : undefined,
    marginInline:
      !hasMarginSides && typeof node.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft:
      typeof node.marginLeftPx === "number"
        ? `${node.marginLeftPx}px`
        : undefined,
    marginRight:
      typeof node.marginRightPx === "number"
        ? `${node.marginRightPx}px`
        : undefined,
    paddingTop:
      typeof node.paddingTopPx === "number"
        ? `${node.paddingTopPx}px`
        : undefined,
    paddingBottom:
      typeof node.paddingBottomPx === "number"
        ? `${node.paddingBottomPx}px`
        : undefined,
    paddingInline:
      !hasPaddingSides && typeof node.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft:
      typeof node.paddingLeftPx === "number"
        ? `${node.paddingLeftPx}px`
        : undefined,
    paddingRight:
      typeof node.paddingRightPx === "number"
        ? `${node.paddingRightPx}px`
        : undefined,
    fontSize: sizeMapper(node.size),
    color: textToneColor(node.tone),
    display:
      node.visibility === "visible"
        ? "revert"
        : visibilityDisplay(node.visibility),
  });
}

function footerCtaAlignDecls(align?: "left" | "center" | "right"): string[] {
  if (align === "left") return ["align-self:flex-start"];
  if (align === "right") return ["align-self:flex-end"];
  if (align === "center") return ["align-self:center"];
  return [];
}

function footerCtaDecls(
  node:
    | {
        align?: "left" | "center" | "right";
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
  const hasMarginSides =
    typeof node.marginLeftPx === "number" ||
    typeof node.marginRightPx === "number";
  const hasPaddingSides =
    typeof node.paddingLeftPx === "number" ||
    typeof node.paddingRightPx === "number";
  return [
    ...footerCtaAlignDecls(node.align),
    ...toCssDecls({
      ...buttonSize(node.size),
      marginTop: typeof node.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
      marginBottom:
        typeof node.marginBottomPx === "number"
          ? `${node.marginBottomPx}px`
          : undefined,
      marginInline:
        !hasMarginSides && typeof node.marginInlinePx === "number"
          ? `${node.marginInlinePx}px`
          : undefined,
      marginLeft:
        typeof node.marginLeftPx === "number"
          ? `${node.marginLeftPx}px`
          : undefined,
      marginRight:
        typeof node.marginRightPx === "number"
          ? `${node.marginRightPx}px`
          : undefined,
      paddingTop:
        typeof node.paddingTopPx === "number"
          ? `${node.paddingTopPx}px`
          : undefined,
      paddingBottom:
        typeof node.paddingBottomPx === "number"
          ? `${node.paddingBottomPx}px`
          : undefined,
      paddingInline:
        !hasPaddingSides && typeof node.paddingInlinePx === "number"
          ? `${node.paddingInlinePx}px`
          : undefined,
      paddingLeft:
        typeof node.paddingLeftPx === "number"
          ? `${node.paddingLeftPx}px`
          : undefined,
      paddingRight:
        typeof node.paddingRightPx === "number"
          ? `${node.paddingRightPx}px`
          : undefined,
      display:
        node.visibility === "visible"
          ? "revert"
          : visibilityDisplay(node.visibility),
    }),
  ];
}

/**
 * Server-rendered featured talent section.
 *
 * Reads the composed section config, fetches tenant-scoped talent cards per
 * `sourceMode`, and renders them in the same visual family as /directory
 * cards (via the shared `talent-card` class + `data-card-*` hooks).
 *
 * Empty behaviour:
 *   - No tenant id, Supabase misconfigured, empty roster, or strictly-empty
 *     manual-pick/filter → render the header (eyebrow / headline / copy /
 *     CTA) and a soft empty note so the section is still admin-visible.
 *     Never throws.
 */
export async function FeaturedTalentComponent({
  props,
  tenantId,
  locale,
  preview,
  sectionId,
  publicPathPrefix,
  builderNodeBindings,
}: SectionComponentProps<FeaturedTalentV1>) {
  const {
    eyebrow,
    headline,
    copy,
    sourceMode,
    variant,
    columnsDesktop,
    footerCta,
    presentation,
    requestCta,
    emptyStateText,
    layoutPreset,
    headerAlign,
    cardChrome,
    imageTreatment,
    showBookmarkIcon,
    actionStyle,
    headless,
  } = props;
  const isV11Showcase = layoutPreset === "v11-showcase";
  const effectiveHeaderAlign =
    headerAlign ?? (isV11Showcase ? "center" : "split");
  const effectiveCardChrome =
    cardChrome ?? (isV11Showcase ? "v11-noir" : "standard");
  const effectiveImageTreatment =
    imageTreatment ?? (isV11Showcase ? "cinematic" : "natural");
  const effectiveActionStyle =
    actionStyle ?? (isV11Showcase ? "outline-duo" : "primary-duo");

  // P1-2 / 6A.3 — render-layer display controls (undefined = show;
  // back-compat). showSecondaryType / showLanguages are now backed by real
  // DTO data on the direct-query path; showAvailability is structural-only
  // until a reliable source exists (never renders fake data).
  const cardDisplay = {
    showName: props.showName,
    showPrimaryType: props.showPrimaryType,
    showSecondaryType: props.showSecondaryType,
    showCity: props.showCity,
    showLanguages: props.showLanguages,
    showAvailability: props.showAvailability,
    showBadge: props.showBadge,
    parentCategoryDisplay: props.parentCategoryDisplay,
    cardVariant: props.cardVariant,
    showBookmarkIcon,
    cardChrome: effectiveCardChrome,
    imageTreatment: effectiveImageTreatment,
    actionStyle: effectiveActionStyle,
  };

  // Hard cap at 15 regardless of source mode (schema also bounds `limit`).
  const cards = (
    await fetchFeaturedTalentForSection(tenantId, props, locale)
  ).slice(0, 15);
  const hasCards = cards.length > 0;
  const columns = Math.max(2, Math.min(4, columnsDesktop ?? 3));
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const nodePresentation = props.nodePresentation ?? {};
  const headAlign =
    nodePresentation.subheadline?.align ??
    nodePresentation.headline?.align ??
    nodePresentation.copy?.align ??
    (effectiveHeaderAlign === "center" ? "center" : undefined);
  const ctaAlign = nodePresentation.footerCta?.align;
  const footerCtaInHeader = footerCta && !isV11Showcase;
  const footerCtaBelow = footerCta && isV11Showcase;
  // 6C — single-source link resolution (LinkRef object or legacy
  // string; auth routes stay root, tenant pages prefix-aware).
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const rosterAddHref = publicPathPrefix
    ? `${publicPathPrefix}/admin/roster/new`
    : "/admin/roster/new";
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-featured-talent__head-text",
        tablet: toCssDecls({
          textAlign: textAlignFor(
            nodePresentation.subheadline?.breakpoints?.tablet?.align ??
              nodePresentation.headline?.breakpoints?.tablet?.align ??
              nodePresentation.copy?.breakpoints?.tablet?.align,
          ),
        }),
        mobile: toCssDecls({
          textAlign: textAlignFor(
            nodePresentation.subheadline?.breakpoints?.mobile?.align ??
              nodePresentation.headline?.breakpoints?.mobile?.align ??
              nodePresentation.copy?.breakpoints?.mobile?.align,
          ),
        }),
      },
      {
        selector: ".site-eyebrow > span",
        tablet: textNodeDecls(
          nodePresentation.subheadline?.breakpoints?.tablet,
          eyebrowSize,
        ),
        mobile: textNodeDecls(
          nodePresentation.subheadline?.breakpoints?.mobile,
          eyebrowSize,
        ),
      },
      {
        selector: ".site-featured-talent__headline",
        tablet: textNodeDecls(
          nodePresentation.headline?.breakpoints?.tablet,
          headingSize,
        ),
        mobile: textNodeDecls(
          nodePresentation.headline?.breakpoints?.mobile,
          headingSize,
        ),
      },
      {
        selector: ".site-featured-talent__copy",
        tablet: textNodeDecls(
          nodePresentation.copy?.breakpoints?.tablet,
          paragraphSize,
        ),
        mobile: textNodeDecls(
          nodePresentation.copy?.breakpoints?.mobile,
          paragraphSize,
        ),
      },
      {
        selector: ".site-featured-talent__cta",
        tablet: footerCtaDecls(nodePresentation.footerCta?.breakpoints?.tablet),
        mobile: footerCtaDecls(nodePresentation.footerCta?.breakpoints?.mobile),
      },
    ],
  });

  return (
    <section
      className="site-featured-talent"
      data-variant={variant}
      data-ft-layout={layoutPreset ?? "standard"}
      data-ft-header-align={effectiveHeaderAlign}
      data-ft-card-chrome={effectiveCardChrome}
      data-ft-image-treatment={effectiveImageTreatment}
      data-ft-action-style={effectiveActionStyle}
      data-ft-bookmark={showBookmarkIcon === true ? "on" : "off"}
      data-source-mode={sourceMode}
      data-card-count={cards.length}
      {...presentationDataAttrs(presentation)}
      style={{
        ["--ft-cols" as string]: String(columns),
        ...presentationInlineStyles(presentation),
      }}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <div className="site-featured-talent__inner">
        {!headless && (eyebrow || headline || copy || footerCtaInHeader) && (
          <header className="site-featured-talent__head">
            <div
              className="site-featured-talent__head-text"
              style={{ textAlign: textAlignFor(headAlign) }}
            >
              {eyebrow ? (
                <span className="site-eyebrow" data-builder-node-id={nodeIdsByRole?.subheadline}>
                  <span
                    style={{
                      textAlign: textAlignFor(nodePresentation.subheadline?.align),
                      maxWidth: nodePresentation.subheadline?.maxWidthPx
                        ? `${nodePresentation.subheadline.maxWidthPx}px`
                        : undefined,
                      marginTop:
                        typeof nodePresentation.subheadline?.marginTopPx === "number"
                          ? `${nodePresentation.subheadline.marginTopPx}px`
                          : undefined,
                      marginBottom:
                        typeof nodePresentation.subheadline?.marginBottomPx === "number"
                          ? `${nodePresentation.subheadline.marginBottomPx}px`
                          : undefined,
                      marginInline:
                        typeof nodePresentation.subheadline?.marginLeftPx !== "number" &&
                        typeof nodePresentation.subheadline?.marginRightPx !== "number" &&
                        typeof nodePresentation.subheadline?.marginInlinePx === "number"
                          ? `${nodePresentation.subheadline.marginInlinePx}px`
                          : undefined,
                      marginLeft:
                        typeof nodePresentation.subheadline?.marginLeftPx === "number"
                          ? `${nodePresentation.subheadline.marginLeftPx}px`
                          : undefined,
                      marginRight:
                        typeof nodePresentation.subheadline?.marginRightPx === "number"
                          ? `${nodePresentation.subheadline.marginRightPx}px`
                          : undefined,
                      paddingTop:
                        typeof nodePresentation.subheadline?.paddingTopPx === "number"
                          ? `${nodePresentation.subheadline.paddingTopPx}px`
                          : undefined,
                      paddingBottom:
                        typeof nodePresentation.subheadline?.paddingBottomPx === "number"
                          ? `${nodePresentation.subheadline.paddingBottomPx}px`
                          : undefined,
                      paddingInline:
                        typeof nodePresentation.subheadline?.paddingLeftPx !== "number" &&
                        typeof nodePresentation.subheadline?.paddingRightPx !== "number" &&
                        typeof nodePresentation.subheadline?.paddingInlinePx === "number"
                          ? `${nodePresentation.subheadline.paddingInlinePx}px`
                          : undefined,
                      paddingLeft:
                        typeof nodePresentation.subheadline?.paddingLeftPx === "number"
                          ? `${nodePresentation.subheadline.paddingLeftPx}px`
                          : undefined,
                      paddingRight:
                        typeof nodePresentation.subheadline?.paddingRightPx === "number"
                          ? `${nodePresentation.subheadline.paddingRightPx}px`
                          : undefined,
                      fontSize: eyebrowSize(nodePresentation.subheadline?.size),
                      color: textToneColor(nodePresentation.subheadline?.tone),
                      display: visibilityDisplay(nodePresentation.subheadline?.visibility),
                    }}
                  >
                    {eyebrow}
                  </span>
                </span>
              ) : null}
              {headline ? (
                <h2
                  className="site-featured-talent__headline"
                  data-builder-node-id={nodeIdsByRole?.headline}
                  style={{
                    maxWidth: nodePresentation.headline?.maxWidthPx
                      ? `${nodePresentation.headline.maxWidthPx}px`
                      : undefined,
                    marginTop:
                      typeof nodePresentation.headline?.marginTopPx === "number"
                        ? `${nodePresentation.headline.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof nodePresentation.headline?.marginBottomPx ===
                      "number"
                        ? `${nodePresentation.headline.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof nodePresentation.headline?.marginLeftPx !==
                        "number" &&
                      typeof nodePresentation.headline?.marginRightPx !==
                        "number" &&
                      typeof nodePresentation.headline?.marginInlinePx ===
                        "number"
                        ? `${nodePresentation.headline.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof nodePresentation.headline?.marginLeftPx === "number"
                        ? `${nodePresentation.headline.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof nodePresentation.headline?.marginRightPx ===
                      "number"
                        ? `${nodePresentation.headline.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof nodePresentation.headline?.paddingTopPx === "number"
                        ? `${nodePresentation.headline.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof nodePresentation.headline?.paddingBottomPx ===
                      "number"
                        ? `${nodePresentation.headline.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof nodePresentation.headline?.paddingLeftPx !==
                        "number" &&
                      typeof nodePresentation.headline?.paddingRightPx !==
                        "number" &&
                      typeof nodePresentation.headline?.paddingInlinePx ===
                        "number"
                        ? `${nodePresentation.headline.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof nodePresentation.headline?.paddingLeftPx ===
                      "number"
                        ? `${nodePresentation.headline.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof nodePresentation.headline?.paddingRightPx ===
                      "number"
                        ? `${nodePresentation.headline.paddingRightPx}px`
                        : undefined,
                    fontSize: headingSize(nodePresentation.headline?.size),
                    color: textToneColor(nodePresentation.headline?.tone),
                    display: visibilityDisplay(nodePresentation.headline?.visibility),
                  }}
                >
                  {renderInlineRich(headline)}
                </h2>
              ) : null}
              {copy ? (
                <p
                  className="site-featured-talent__copy"
                  data-builder-node-id={nodeIdsByRole?.copy}
                  style={{
                    maxWidth: nodePresentation.copy?.maxWidthPx
                      ? `${nodePresentation.copy.maxWidthPx}px`
                      : undefined,
                    marginTop:
                      typeof nodePresentation.copy?.marginTopPx === "number"
                        ? `${nodePresentation.copy.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof nodePresentation.copy?.marginBottomPx === "number"
                        ? `${nodePresentation.copy.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof nodePresentation.copy?.marginLeftPx !== "number" &&
                      typeof nodePresentation.copy?.marginRightPx !== "number" &&
                      typeof nodePresentation.copy?.marginInlinePx === "number"
                        ? `${nodePresentation.copy.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof nodePresentation.copy?.marginLeftPx === "number"
                        ? `${nodePresentation.copy.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof nodePresentation.copy?.marginRightPx === "number"
                        ? `${nodePresentation.copy.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof nodePresentation.copy?.paddingTopPx === "number"
                        ? `${nodePresentation.copy.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof nodePresentation.copy?.paddingBottomPx === "number"
                        ? `${nodePresentation.copy.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof nodePresentation.copy?.paddingLeftPx !== "number" &&
                      typeof nodePresentation.copy?.paddingRightPx !== "number" &&
                      typeof nodePresentation.copy?.paddingInlinePx === "number"
                        ? `${nodePresentation.copy.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof nodePresentation.copy?.paddingLeftPx === "number"
                        ? `${nodePresentation.copy.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof nodePresentation.copy?.paddingRightPx === "number"
                        ? `${nodePresentation.copy.paddingRightPx}px`
                        : undefined,
                    fontSize: paragraphSize(nodePresentation.copy?.size),
                    color: textToneColor(nodePresentation.copy?.tone),
                    display: visibilityDisplay(nodePresentation.copy?.visibility),
                  }}
                >
                  {copy}
                </p>
              ) : null}
            </div>
            {footerCtaInHeader ? (
              <a
                href={resolveLinkLike(footerCta.href, linkCtx).href}
                className="site-btn site-btn--outline site-btn--sm site-featured-talent__cta"
                data-builder-node-id={nodeIdsByRole?.footerCta}
                style={{
                  alignSelf:
                    ctaAlign === "left"
                      ? "flex-start"
                      : ctaAlign === "right"
                        ? "flex-end"
                        : ctaAlign === "center"
                          ? "center"
                          : undefined,
                  ...buttonSize(nodePresentation.footerCta?.size),
                  marginTop:
                    typeof nodePresentation.footerCta?.marginTopPx === "number"
                      ? `${nodePresentation.footerCta.marginTopPx}px`
                      : undefined,
                  marginBottom:
                    typeof nodePresentation.footerCta?.marginBottomPx ===
                    "number"
                      ? `${nodePresentation.footerCta.marginBottomPx}px`
                      : undefined,
                  marginInline:
                    typeof nodePresentation.footerCta?.marginLeftPx !== "number" &&
                    typeof nodePresentation.footerCta?.marginRightPx !== "number" &&
                    typeof nodePresentation.footerCta?.marginInlinePx === "number"
                      ? `${nodePresentation.footerCta.marginInlinePx}px`
                      : undefined,
                  marginLeft:
                    typeof nodePresentation.footerCta?.marginLeftPx === "number"
                      ? `${nodePresentation.footerCta.marginLeftPx}px`
                      : undefined,
                  marginRight:
                    typeof nodePresentation.footerCta?.marginRightPx === "number"
                      ? `${nodePresentation.footerCta.marginRightPx}px`
                      : undefined,
                  paddingTop:
                    typeof nodePresentation.footerCta?.paddingTopPx === "number"
                      ? `${nodePresentation.footerCta.paddingTopPx}px`
                      : undefined,
                  paddingBottom:
                    typeof nodePresentation.footerCta?.paddingBottomPx ===
                    "number"
                      ? `${nodePresentation.footerCta.paddingBottomPx}px`
                      : undefined,
                  paddingInline:
                    typeof nodePresentation.footerCta?.paddingLeftPx !==
                      "number" &&
                    typeof nodePresentation.footerCta?.paddingRightPx !==
                      "number" &&
                    typeof nodePresentation.footerCta?.paddingInlinePx ===
                      "number"
                      ? `${nodePresentation.footerCta.paddingInlinePx}px`
                      : undefined,
                  paddingLeft:
                    typeof nodePresentation.footerCta?.paddingLeftPx ===
                    "number"
                      ? `${nodePresentation.footerCta.paddingLeftPx}px`
                      : undefined,
                  paddingRight:
                    typeof nodePresentation.footerCta?.paddingRightPx ===
                    "number"
                      ? `${nodePresentation.footerCta.paddingRightPx}px`
                      : undefined,
                  display: visibilityDisplay(nodePresentation.footerCta?.visibility),
                }}
              >
                <span>{footerCta.label ?? "Explore"}</span>
              </a>
            ) : null}
          </header>
        )}

        {hasCards ? (
          <div
            className="site-featured-talent__grid"
            data-grid-variant={variant}
          >
            {cards.map((card, i) => (
              // Wrap in a relative container so TalentCardActions can
              // overlay the bookmark + inquiry buttons as an absolute
              // sibling outside the card's <Link> (no nested interactives).
              <div key={card.id} className="relative">
                <FeaturedTalentCard
                  card={card}
                  priority={i < columns}
                  publicPathPrefix={publicPathPrefix}
                  display={cardDisplay}
                  requestCta={
                    requestCta
                      ? {
                          label: requestCta.label,
                          href: resolveLinkLike(requestCta.href, linkCtx).href,
                        }
                      : null
                  }
                  locale={locale}
                />
                <TalentCardActions
                  talentProfileId={card.id}
                  profileCode={card.profileCode}
                  displayName={card.displayName}
                  sourcePage="/featured-talent"
                  variant="compact"
                  className="absolute right-2.5 top-2.5 z-[2]"
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="site-featured-talent__empty"
            data-source={sourceMode}
            role="status"
          >
            <p className="site-featured-talent__empty-note">
              {emptyStateText && emptyStateText.trim().length > 0
                ? emptyStateText
                : emptyCopy(sourceMode, props)}
            </p>
            {/* Operator-only admin route — editor (preview) only. Public/anon
                renders pass preview=false, so it never leaks onto a published
                storefront. The empty note above still renders (never blank). */}
            {preview ? (
              <a href={rosterAddHref} className="site-featured-talent__empty-action">
                Add or publish roster profiles
              </a>
            ) : null}
          </div>
        )}
        {footerCtaBelow ? (
          <div className="site-featured-talent__footer">
            <a
              href={resolveLinkLike(footerCta.href, linkCtx).href}
              className="site-btn site-btn--outline site-btn--sm site-featured-talent__cta"
              data-builder-node-id={nodeIdsByRole?.footerCta}
              style={{
                ...buttonSize(nodePresentation.footerCta?.size),
                display: visibilityDisplay(nodePresentation.footerCta?.visibility),
              }}
            >
              <span>{footerCta.label ?? "Explore"}</span>
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function emptyCopy(
  mode: FeaturedTalentV1["sourceMode"],
  props: FeaturedTalentV1,
): string {
  switch (mode) {
    case "manual_pick":
      if (!props.manualProfileCodes?.length) {
        return "Pick specific professionals to feature from the admin editor.";
      }
      return "The selected professionals are not currently published for this site.";
    case "auto_by_service":
      if (!props.filterServiceSlug) {
        return "Pick a service category in the section editor to populate this block.";
      }
      return `No published professionals found for service "${props.filterServiceSlug}".`;
    case "auto_by_destination":
      if (!props.filterDestinationSlug) {
        return "Pick a destination slug in the section editor to populate this block.";
      }
      return `No published professionals available in "${props.filterDestinationSlug}" right now.`;
    case "auto_featured_flag":
      return "No featured profiles are currently public on this site.";
    case "auto_recent":
      return "No published roster profiles are available for this section yet.";
    default:
      return "No professionals available for this section.";
  }
}
