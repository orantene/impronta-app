import type { CSSProperties } from "react";

import type { SectionComponentProps } from "../types";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { HeroV1, HeroSlide } from "./schema";

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
  if (size === "sm") return "clamp(1.7rem, 3.8vw, 2.85rem)";
  if (size === "lg") return "clamp(2.25rem, 5.6vw, 4.35rem)";
  if (size === "xl") return "clamp(2.6rem, 6.6vw, 5.2rem)";
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(0.92rem, 1.15vw, 1.06rem)";
  if (size === "lg") return "clamp(1.08rem, 1.58vw, 1.36rem)";
  if (size === "xl") return "clamp(1.2rem, 1.85vw, 1.56rem)";
  return undefined;
}

function visibilityDisplay(
  visibility?: "visible" | "hidden",
): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

function ctaSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties {
  if (size === "sm") return { padding: "0.66rem 1.2rem", fontSize: "0.84rem" };
  if (size === "lg") return { padding: "0.95rem 1.8rem", fontSize: "1.02rem" };
  if (size === "xl") return { padding: "1.08rem 2.1rem", fontSize: "1.08rem" };
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
 * Server-rendered hero with three progressive rendering modes:
 *
 *   1. Classic (M0 parity) — no `slides`, no imagery. Just headline +
 *      subheadline + CTAs over the site ambient background.
 *   2. Single image — `slides` has one entry OR `backgroundMediaAssetId`
 *      is set. A photographic backdrop with scrim/aurora/vignette overlays.
 *   3. Slider — `slides` has 2+ entries. Pure-CSS cross-fade reel driven
 *      by @keyframes on a per-slide delay; `scroll-snap` fallback for
 *      reduced-motion users and touch gestures.
 *
 * The component stays a React Server Component (no client JS) so the
 * storefront hero remains fully static. Interaction affordances (pause,
 * prev/next) belong in a future client-wrapped variant.
 *
 * Phase E (Final Batch 3) — exempt from head-only migration.
 * This section has no eyebrow field. The headline is a page-level <h1>
 * (not a section <h2>), so SectionHead would demote the heading level and
 * break accessibility semantics. The @keyframes background slider system
 * and --hero-slider-* CSS vars are preserved exactly as-is.
 */
export function HeroComponent({
  props,
  sectionId,
  tenantId,
  publicPathPrefix = "",
  builderNodeBindings,
}: SectionComponentProps<HeroV1>) {
  const {
    headline,
    subheadline,
    search,
    categoryChips,
    primaryCta,
    secondaryCta,
    backgroundMediaAssetId,
    overlay,
    mood,
    slides,
    autoplayMs,
    presentation,
  } = props;

  // 6C — single-source link resolution (LinkRef object or legacy
  // string; auth routes stay root, tenant pages prefix-aware).
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const primaryLink = primaryCta
    ? resolveLinkLike(primaryCta.href, linkCtx)
    : null;
  const secondaryLink = secondaryCta
    ? resolveLinkLike(secondaryCta.href, linkCtx)
    : null;

  const effectiveOverlay = overlay ?? (slides?.length || backgroundMediaAssetId ? "gradient-scrim" : "aurora");
  const effectiveMood = mood ?? "editorial";
  const perSlideMs = Math.max(2000, Math.min(20000, autoplayMs ?? 7000));
  const nodePresentation = props.nodePresentation ?? {};

  const hasSlides = Array.isArray(slides) && slides.length > 0;
  const isSlider = hasSlides && slides!.length > 1;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
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
        selector: ".site-hero__headline",
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
        selector: ".site-hero__subheadline",
        tablet: textNodeDecls(
          nodePresentation.subheadline?.breakpoints?.tablet,
          paragraphSize,
        ),
        mobile: textNodeDecls(
          nodePresentation.subheadline?.breakpoints?.mobile,
          paragraphSize,
        ),
      },
      {
        selector: ".site-hero__cta--primary",
        tablet: ctaDecls(nodePresentation.primaryCta?.breakpoints?.tablet),
        mobile: ctaDecls(nodePresentation.primaryCta?.breakpoints?.mobile),
      },
      {
        selector: ".site-hero__cta--secondary",
        tablet: ctaDecls(nodePresentation.secondaryCta?.breakpoints?.tablet),
        mobile: ctaDecls(nodePresentation.secondaryCta?.breakpoints?.mobile),
      },
      {
        selector: ".site-hero__ctas",
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
      className="site-hero"
      data-section-type="hero"
      data-hero-mood={effectiveMood}
      data-hero-overlay={effectiveOverlay}
      data-hero-variant={isSlider ? "slider" : hasSlides ? "image" : "clean"}
      data-hero-layout={(props as { layout?: string }).layout ?? "centered"}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      {hasSlides ? (
        <HeroBackground slides={slides!} perSlideMs={perSlideMs} isSlider={isSlider} />
      ) : null}

      {effectiveOverlay !== "none" ? (
        <div className="site-hero__overlay" aria-hidden />
      ) : null}

      <div className="site-hero__inner">
        <div className="site-hero__copy">
          <h1
            className="site-hero__headline"
            data-builder-node-id={nodeIdsByRole?.headline}
            style={{
              textAlign: textAlignFor(nodePresentation.headline?.align),
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
          </h1>
          {subheadline ? (
            <p
              className="site-hero__subheadline"
              data-builder-node-id={nodeIdsByRole?.subheadline}
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
                  typeof nodePresentation.subheadline?.paddingLeftPx !==
                    "number" &&
                  typeof nodePresentation.subheadline?.paddingRightPx !==
                    "number" &&
                  typeof nodePresentation.subheadline?.paddingInlinePx ===
                    "number"
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
                fontSize: paragraphSize(nodePresentation.subheadline?.size),
                color: textToneColor(nodePresentation.subheadline?.tone),
                display: visibilityDisplay(nodePresentation.subheadline?.visibility),
              }}
            >
              {renderInlineRich(subheadline)}
            </p>
          ) : null}
          {search ? (
            <form
              className="site-hero__search"
              action={
                resolveLinkLike(search.actionHref ?? "/directory", linkCtx)
                  .href
              }
              method="get"
            >
              <label className="sr-only" htmlFor={`site-hero-search-${sectionId ?? "default"}`}>
                Search the directory
              </label>
              <input
                id={`site-hero-search-${sectionId ?? "default"}`}
                name="q"
                type="search"
                placeholder={search.placeholder}
                className="site-hero__search-input"
              />
              <button className="site-hero__search-button" type="submit">
                {search.buttonLabel ?? "Search"}
              </button>
            </form>
          ) : null}
          {categoryChips && categoryChips.length > 0 ? (
            <nav className="site-hero__chips" aria-label="Browse by type">
              {categoryChips.map((chip, index) => (
                <a
                  key={`${chip.label}-${index}`}
                  className="site-hero__chip"
                  href={resolveLinkLike(chip.href ?? "/directory", linkCtx).href}
                >
                  {chip.label}
                </a>
              ))}
            </nav>
          ) : null}
          {(primaryCta || secondaryCta) && (
            <div className="site-hero__ctas" style={{ justifyContent: ctaJustify }}>
              {primaryCta && primaryLink ? (
                <a
                  className="site-hero__cta site-hero__cta--primary"
                  href={primaryLink.href}
                  target={primaryLink.openInNew ? "_blank" : undefined}
                  rel={
                    primaryLink.openInNew ? "noopener noreferrer" : undefined
                  }
                  data-builder-node-id={nodeIdsByRole?.primaryCta}
                  style={{
                    ...ctaSize(nodePresentation.primaryCta?.size),
                    marginTop:
                      typeof nodePresentation.primaryCta?.marginTopPx === "number"
                        ? `${nodePresentation.primaryCta.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof nodePresentation.primaryCta?.marginBottomPx ===
                      "number"
                        ? `${nodePresentation.primaryCta.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof nodePresentation.primaryCta?.marginLeftPx !== "number" &&
                      typeof nodePresentation.primaryCta?.marginRightPx !== "number" &&
                      typeof nodePresentation.primaryCta?.marginInlinePx ===
                        "number"
                        ? `${nodePresentation.primaryCta.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof nodePresentation.primaryCta?.marginLeftPx === "number"
                        ? `${nodePresentation.primaryCta.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof nodePresentation.primaryCta?.marginRightPx === "number"
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
                      typeof nodePresentation.primaryCta?.paddingLeftPx !== "number" &&
                      typeof nodePresentation.primaryCta?.paddingRightPx !== "number" &&
                      typeof nodePresentation.primaryCta?.paddingInlinePx ===
                        "number"
                        ? `${nodePresentation.primaryCta.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof nodePresentation.primaryCta?.paddingLeftPx === "number"
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
                </a>
              ) : null}
              {secondaryCta && secondaryLink ? (
                <a
                  className="site-hero__cta site-hero__cta--secondary"
                  href={secondaryLink.href}
                  target={secondaryLink.openInNew ? "_blank" : undefined}
                  rel={
                    secondaryLink.openInNew ? "noopener noreferrer" : undefined
                  }
                  data-builder-node-id={nodeIdsByRole?.secondaryCta}
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
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroBackground({
  slides,
  perSlideMs,
  isSlider,
}: {
  slides: HeroSlide[];
  perSlideMs: number;
  isSlider: boolean;
}) {
  if (!isSlider) {
    const only = slides[0];
    const bgUrl = only.backgroundImageUrl;
    if (!bgUrl) return null;
    return (
      <div
        className="site-hero__bg site-hero__bg--static"
        style={{ backgroundImage: `url(${JSON.stringify(bgUrl).slice(1, -1)})` }}
        aria-hidden
      />
    );
  }

  const totalMs = perSlideMs * slides.length;
  return (
    <div
      className="site-hero__bg site-hero__bg--slider"
      style={
        {
          "--hero-slider-total": `${totalMs}ms`,
          "--hero-slider-count": slides.length,
        } as CSSProperties
      }
      aria-hidden
    >
      {slides.map((s, i) => {
        if (!s.backgroundImageUrl) return null;
        const delay = i * perSlideMs;
        return (
          <div
            key={i}
            className="site-hero__slide"
            style={
              {
                backgroundImage: `url(${JSON.stringify(s.backgroundImageUrl).slice(1, -1)})`,
                "--hero-slide-delay": `${delay}ms`,
                "--hero-slide-index": i,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
