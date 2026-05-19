import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Cta } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import type { CtaBannerV1 } from "./schema";
import type { CSSProperties } from "react";

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

function headingSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(1.8rem, 3.8vw, 2.9rem)";
  if (size === "lg") return "clamp(2.4rem, 5.8vw, 4.8rem)";
  if (size === "xl") return "clamp(2.8rem, 6.8vw, 5.8rem)";
  return undefined;
}

function eyebrowSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.68rem";
  if (size === "lg") return "0.84rem";
  if (size === "xl") return "0.92rem";
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.98rem";
  if (size === "lg") return "1.16rem";
  if (size === "xl") return "1.28rem";
  return undefined;
}

function visibilityDisplay(
  visibility?: "visible" | "hidden",
): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

function ctaSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties {
  if (size === "sm") return { padding: "0.64rem 1.14rem", fontSize: "0.84rem" };
  if (size === "lg") return { padding: "0.92rem 1.74rem", fontSize: "1rem" };
  if (size === "xl") return { padding: "1.06rem 2rem", fontSize: "1.06rem" };
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
  if (style.justifyContent) decls.push(`justify-content:${style.justifyContent}`);
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
        size?: "sm" | "md" | "lg" | "xl";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl") => CSSProperties["fontSize"],
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
  const hasMarginSides =
    typeof node.marginLeftPx === "number" ||
    typeof node.marginRightPx === "number";
  const hasPaddingSides =
    typeof node.paddingLeftPx === "number" ||
    typeof node.paddingRightPx === "number";
  return toCssDecls({
    ...ctaSize(node.size),
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
  });
}

function justifyDeclFromAlign(align?: "left" | "center" | "right"): string[] {
  if (align === "left") return ["justify-content:flex-start"];
  if (align === "right") return ["justify-content:flex-end"];
  if (align === "center") return ["justify-content:center"];
  return [];
}

/**
 * Server-rendered CTA banner. Variant selection happens via a `data-variant`
 * attribute that storefront CSS targets for its layout rules.
 *
 * Phase E (Batch 2) — adopts the shared `Cta` primitive for primary +
 * secondary buttons. Section-internal layout (`__shell` / `__inner` and
 * variant-specific positioning rules) is intentionally preserved — the
 * three variants (centered-overlay / split-image / minimal-band) all
 * depend on the `__inner` element being the positioning context, plus
 * the `__headline` carries a deliberately large clamp(34px, 5.2vw, 68px)
 * that's distinctive to this section's editorial conversion tone. Only
 * the CTA shape unifies.
 */
export function CtaBannerComponent({
  props,
  sectionId,
  tenantId,
  publicPathPrefix,
  builderNodeBindings,
}: SectionComponentProps<CtaBannerV1>) {
  const {
    eyebrow,
    headline,
    copy,
    reassurance,
    primaryCta,
    secondaryCta,
    backgroundImageUrl,
    backgroundImageAlt,
    overlayOpacity,
    variant,
    imageSide,
    bandTone,
    insetCard,
    presentation,
  } = props;

  // 6C — resolve CTA LinkRefs through the single source of truth.
  // robust whether props arrive as a LinkRef object (new editor writes)
  // or a raw legacy string (existing snapshots): resolveLinkLike coerces.
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const primaryLink = primaryCta
    ? resolveLinkLike(primaryCta.href, linkCtx)
    : null;
  const secondaryLink = secondaryCta
    ? resolveLinkLike(secondaryCta.href, linkCtx)
    : null;

  const overlayPct = Math.max(0, Math.min(100, overlayOpacity ?? 45));
  const hasBackground =
    variant !== "minimal-band" && Boolean(backgroundImageUrl);
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const nodePresentation = props.nodePresentation ?? {};
  const textAlign =
    nodePresentation.subheadline?.align ??
    nodePresentation.headline?.align ??
    nodePresentation.copy?.align;
  const ctaAlign =
    nodePresentation.primaryCta?.align ?? nodePresentation.secondaryCta?.align;
  const ctaJustify: CSSProperties["justifyContent"] =
    ctaAlign === "left"
      ? "flex-start"
      : ctaAlign === "right"
        ? "flex-end"
        : ctaAlign === "center"
          ? "center"
          : undefined;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-cta-banner__inner",
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
        selector: ".site-cta-banner__headline",
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
        selector: ".site-cta-banner__copy",
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
        selector: ".site-prim-cta--primary",
        tablet: ctaDecls(nodePresentation.primaryCta?.breakpoints?.tablet),
        mobile: ctaDecls(nodePresentation.primaryCta?.breakpoints?.mobile),
      },
      {
        selector: ".site-prim-cta--secondary",
        tablet: ctaDecls(nodePresentation.secondaryCta?.breakpoints?.tablet),
        mobile: ctaDecls(nodePresentation.secondaryCta?.breakpoints?.mobile),
      },
      {
        selector: ".site-cta-banner__ctas",
        tablet: justifyDeclFromAlign(
          nodePresentation.primaryCta?.breakpoints?.tablet?.align ??
            nodePresentation.secondaryCta?.breakpoints?.tablet?.align,
        ),
        mobile: justifyDeclFromAlign(
          nodePresentation.primaryCta?.breakpoints?.mobile?.align ??
            nodePresentation.secondaryCta?.breakpoints?.mobile?.align,
        ),
      },
    ],
  });

  return (
    <section
      className="site-cta-banner"
      data-variant={variant}
      data-image-side={imageSide}
      data-band-tone={bandTone}
      data-inset-card={insetCard ? "true" : undefined}
      data-has-image={hasBackground ? "true" : undefined}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <div className="site-cta-banner__shell">
        {hasBackground ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="site-cta-banner__image"
              src={backgroundImageUrl}
              alt={backgroundImageAlt ?? ""}
              aria-hidden={backgroundImageAlt ? undefined : true}
            />
            <span
              className="site-cta-banner__overlay"
              aria-hidden
              style={{
                // Both CSS vars so rules can use whichever matches their variant.
                ["--cta-overlay-opacity" as string]: String(overlayPct / 100),
              }}
            />
          </>
        ) : null}

        <div
          className="site-cta-banner__inner"
          style={{ textAlign: textAlignFor(textAlign) }}
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
          <h2
            className="site-cta-banner__headline"
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
                typeof nodePresentation.headline?.marginBottomPx === "number"
                  ? `${nodePresentation.headline.marginBottomPx}px`
                  : undefined,
              marginInline:
                typeof nodePresentation.headline?.marginLeftPx !== "number" &&
                typeof nodePresentation.headline?.marginRightPx !== "number" &&
                typeof nodePresentation.headline?.marginInlinePx === "number"
                  ? `${nodePresentation.headline.marginInlinePx}px`
                  : undefined,
              marginLeft:
                typeof nodePresentation.headline?.marginLeftPx === "number"
                  ? `${nodePresentation.headline.marginLeftPx}px`
                  : undefined,
              marginRight:
                typeof nodePresentation.headline?.marginRightPx === "number"
                  ? `${nodePresentation.headline.marginRightPx}px`
                  : undefined,
              paddingTop:
                typeof nodePresentation.headline?.paddingTopPx === "number"
                  ? `${nodePresentation.headline.paddingTopPx}px`
                  : undefined,
              paddingBottom:
                typeof nodePresentation.headline?.paddingBottomPx === "number"
                  ? `${nodePresentation.headline.paddingBottomPx}px`
                  : undefined,
              paddingInline:
                typeof nodePresentation.headline?.paddingLeftPx !== "number" &&
                typeof nodePresentation.headline?.paddingRightPx !== "number" &&
                typeof nodePresentation.headline?.paddingInlinePx === "number"
                  ? `${nodePresentation.headline.paddingInlinePx}px`
                  : undefined,
              paddingLeft:
                typeof nodePresentation.headline?.paddingLeftPx === "number"
                  ? `${nodePresentation.headline.paddingLeftPx}px`
                  : undefined,
              paddingRight:
                typeof nodePresentation.headline?.paddingRightPx === "number"
                  ? `${nodePresentation.headline.paddingRightPx}px`
                  : undefined,
              fontSize: headingSize(nodePresentation.headline?.size),
              color: textToneColor(nodePresentation.headline?.tone),
              display: visibilityDisplay(nodePresentation.headline?.visibility),
            }}
          >
            {renderInlineRich(headline)}
          </h2>
          {copy ? (
            <p
              className="site-cta-banner__copy"
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
          {(primaryCta || secondaryCta) && (
            <div
              className="site-prim-ctas site-cta-banner__ctas"
              style={{ justifyContent: ctaJustify }}
            >
              {primaryCta ? (
                <Cta
                  href={primaryLink?.href ?? "#"}
                  newTab={primaryLink?.openInNew}
                  variant="primary"
                  builderNodeId={nodeIdsByRole?.primaryCta}
                  style={{
                    ...ctaSize(nodePresentation.primaryCta?.size),
                    marginTop:
                      typeof nodePresentation.primaryCta?.marginTopPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof nodePresentation.primaryCta?.marginBottomPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof nodePresentation.primaryCta?.marginLeftPx !==
                        "number" &&
                      typeof nodePresentation.primaryCta?.marginRightPx !==
                        "number" &&
                      typeof nodePresentation.primaryCta?.marginInlinePx ===
                        "number"
                        ? `${nodePresentation.primaryCta.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof nodePresentation.primaryCta?.marginLeftPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof nodePresentation.primaryCta?.marginRightPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof nodePresentation.primaryCta?.paddingTopPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof nodePresentation.primaryCta?.paddingBottomPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof nodePresentation.primaryCta?.paddingLeftPx !==
                        "number" &&
                      typeof nodePresentation.primaryCta?.paddingRightPx !==
                        "number" &&
                      typeof nodePresentation.primaryCta?.paddingInlinePx ===
                        "number"
                        ? `${nodePresentation.primaryCta.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof nodePresentation.primaryCta?.paddingLeftPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof nodePresentation.primaryCta?.paddingRightPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.paddingRightPx}px`
                        : undefined,
                    display: visibilityDisplay(nodePresentation.primaryCta?.visibility),
                  }}
                >
                  {primaryCta.label}
                </Cta>
              ) : null}
              {secondaryCta ? (
                <Cta
                  href={secondaryLink?.href ?? "#"}
                  newTab={secondaryLink?.openInNew}
                  variant="secondary"
                  builderNodeId={nodeIdsByRole?.secondaryCta}
                  style={{
                    ...ctaSize(nodePresentation.secondaryCta?.size),
                    marginTop:
                      typeof nodePresentation.secondaryCta?.marginTopPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof nodePresentation.secondaryCta?.marginBottomPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof nodePresentation.secondaryCta?.marginLeftPx !==
                        "number" &&
                      typeof nodePresentation.secondaryCta?.marginRightPx !==
                        "number" &&
                      typeof nodePresentation.secondaryCta?.marginInlinePx ===
                        "number"
                        ? `${nodePresentation.secondaryCta.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof nodePresentation.secondaryCta?.marginLeftPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof nodePresentation.secondaryCta?.marginRightPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof nodePresentation.secondaryCta?.paddingTopPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof nodePresentation.secondaryCta?.paddingBottomPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof nodePresentation.secondaryCta?.paddingLeftPx !==
                        "number" &&
                      typeof nodePresentation.secondaryCta?.paddingRightPx !==
                        "number" &&
                      typeof nodePresentation.secondaryCta?.paddingInlinePx ===
                        "number"
                        ? `${nodePresentation.secondaryCta.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof nodePresentation.secondaryCta?.paddingLeftPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof nodePresentation.secondaryCta?.paddingRightPx ===
                      "number"
                        ? `${nodePresentation.secondaryCta.paddingRightPx}px`
                        : undefined,
                    display: visibilityDisplay(nodePresentation.secondaryCta?.visibility),
                  }}
                >
                  {secondaryCta.label}
                </Cta>
              ) : null}
            </div>
          )}
          {reassurance ? (
            <p className="site-cta-banner__reassurance">{reassurance}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
