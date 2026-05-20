import type { CSSProperties } from "react";

import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import {
  buildNodePresentationResponsiveCss,
  type NodePresentationValue,
} from "../shared/node-presentation";
import { renderInlineRich } from "../shared/rich-text";
import {
  Container,
  SectionHead,
  Cta,
  MediaFrame,
} from "../shared/section-primitives";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import type { LinkRef } from "@/lib/site-admin/links/link-ref";
import type { SectionComponentProps } from "../types";
import type { TalentTypeGridV1 } from "./schema";
import { fetchTenantTalentCategories } from "./fetch";
import { TalentTypeGridRailControls } from "./TalentTypeGridRailControls";

type Card = {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  imagePosition?: string;
  imageAlt?: string;
  href: string;
  count?: number;
  featured?: boolean;
};

function colsFor(layout: TalentTypeGridV1["desktopLayout"]): string {
  if (layout === "featured-pod-rail" || layout === "horizontal-rail")
    return "none";
  if (layout === "compact-grid") return "repeat(auto-fill, minmax(180px, 1fr))";
  if (layout === "editorial-asymmetric")
    return "repeat(auto-fill, minmax(240px, 1fr))";
  return "repeat(auto-fill, minmax(220px, 1fr))";
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96);
}

function textAlignFor(
  align?: "left" | "center" | "right",
): CSSProperties["textAlign"] {
  if (align === "left") return "left";
  if (align === "right") return "right";
  if (align === "center") return "center";
  return undefined;
}

function textToneColor(
  tone?: "default" | "muted" | "strong",
): CSSProperties["color"] {
  if (tone === "muted") return "var(--token-color-muted)";
  if (tone === "strong") return "var(--tt-ivory, var(--foreground))";
  return undefined;
}

function eyebrowSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.66rem";
  if (size === "lg") return "0.84rem";
  if (size === "xl") return "0.92rem";
  return undefined;
}

function headingSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(2.1rem, 3.3vw, 3.1rem)";
  if (size === "md") return "clamp(2.45rem, 3.85vw, 3.85rem)";
  if (size === "lg") return "clamp(2.75rem, 4.25vw, 4.35rem)";
  if (size === "xl") return "clamp(3rem, 4.7vw, 4.85rem)";
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.95rem";
  if (size === "lg") return "1.1rem";
  if (size === "xl") return "1.2rem";
  return undefined;
}

function visibilityDisplay(
  visibility?: "visible" | "hidden",
): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

function textNodeStyle(
  node: NodePresentationValue | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl") => CSSProperties["fontSize"],
): CSSProperties {
  if (!node) return {};
  const hasMarginSides =
    typeof node.marginLeftPx === "number" ||
    typeof node.marginRightPx === "number";
  const hasPaddingSides =
    typeof node.paddingLeftPx === "number" ||
    typeof node.paddingRightPx === "number";
  return {
    textAlign: textAlignFor(node.align),
    maxWidth: node.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    marginTop:
      typeof node.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node.marginBottomPx === "number"
        ? `${node.marginBottomPx}px`
        : undefined,
    marginInline:
      !hasMarginSides && typeof node.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft:
      typeof node.marginLeftPx === "number" ? `${node.marginLeftPx}px` : undefined,
    marginRight:
      typeof node.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop:
      typeof node.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
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
  };
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

function textNodeDecls(
  node: NodePresentationValue | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl") => CSSProperties["fontSize"],
): string[] {
  return toCssDecls(textNodeStyle(node, sizeMapper));
}

function renderCardIcon(icon?: string) {
  switch (icon) {
    case "◑":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" />
        </svg>
      );
    case "✦":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 3.8l2.1 5.9 5.9 2.1-5.9 2.1L12 20.2l-2.1-6.3L4 11.8l5.9-2.1z"
            fill="currentColor"
          />
        </svg>
      );
    case "✷":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "♪":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M14 5v10.6a3.1 3.1 0 1 1-1.9-2.9V7.1l7-1.8v3.1z"
            fill="currentColor"
          />
        </svg>
      );
    case "♫":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M9 6.5l8-1.9v10.2a2.8 2.8 0 1 1-1.7-2.6V7.7l-4.6 1.1v8.3a2.8 2.8 0 1 1-1.7-2.6z"
            fill="currentColor"
          />
        </svg>
      );
    case "❀":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
          <circle
            cx="12"
            cy="6.5"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle
            cx="17.2"
            cy="10.5"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle
            cx="14.8"
            cy="16.7"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle
            cx="8.1"
            cy="16.2"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle
            cx="6.8"
            cy="9.8"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "◉":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path
            d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      );
    default:
      return icon;
  }
}

export async function TalentTypeGridComponent({
  props,
  tenantId,
  locale,
  sectionId,
  publicPathPrefix = "",
  builderNodeBindings,
}: SectionComponentProps<TalentTypeGridV1>) {
  const {
    eyebrow,
    headline,
    subheadline,
    mode,
    items,
    selectedTermIds,
    parentCategoryMode,
    maxItems,
    showCount,
    showCta,
    ctaLabel,
    seeAllLabel,
    seeAllHref,
    desktopLayout,
    mobileLayout,
    cardRatio,
    textPosition,
    showImages,
    showDescriptions,
    showCardIcons,
    showRailControls,
    overlayOpacity,
    imageOverlayStrength,
    cardTitleScale,
    cardCopyScale,
    emptyStateText,
    nodePresentation,
    presentation,
  } = props;

  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const dirHref = (termId?: string, override?: LinkRef | string): string => {
    if (override) return resolveLinkLike(override, linkCtx).href;
    const raw = termId
      ? `/directory?tax=${encodeURIComponent(termId)}`
      : "/directory";
    return resolveLinkLike(raw, linkCtx).href;
  };

  let cards: Card[] = [];
  if (mode === "dynamic") {
    const derived = await fetchTenantTalentCategories({
      tenantId,
      parentCategoryMode: parentCategoryMode === true,
      selectedTermIds,
      maxItems: maxItems ?? 7,
      locale,
    });
    cards = derived.map((d) => ({
      key: d.termId,
      label: d.label,
      href: dirHref(d.termId),
      count: d.count,
    }));
  } else {
    cards = (items ?? []).slice(0, maxItems ?? 7).map((it, i) => ({
      key: it.taxonomyTermId ?? `${it.label}-${i}`,
      label: it.label,
      description: it.description,
      icon: it.icon,
      imageUrl: it.imageUrl,
      imagePosition: it.imagePosition,
      imageAlt: it.imageAlt,
      href: dirHref(it.taxonomyTermId, it.href),
      featured: it.featured,
    }));
  }

  const isRailLayout =
    desktopLayout === "featured-pod-rail" ||
    desktopLayout === "horizontal-rail";
  const isFeaturedPodLayout = desktopLayout === "featured-pod-rail";
  const requestedFeaturedIndex = cards.findIndex((c) => c.featured === true);
  const featuredIndex =
    requestedFeaturedIndex >= 0 ? requestedFeaturedIndex : 0;
  const displayCards =
    isFeaturedPodLayout && cards.length > 1
      ? [
          cards[featuredIndex],
          ...cards.filter((_, i) => i !== featuredIndex),
        ].filter((card): card is Card => Boolean(card))
      : cards;
  const railKey = sectionId ?? (cards.map((c) => c.key).join("-") || "grid");
  const railId = safeDomId(`tt-${railKey}`);
  const shouldShowImages = showImages !== false;
  const shouldShowDescriptions =
    showDescriptions ?? desktopLayout === "featured-pod-rail";
  const shouldShowIcons =
    showCardIcons ?? desktopLayout === "featured-pod-rail";
  const shouldShowRailControls =
    isRailLayout && showRailControls !== false && cards.length > 2;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const textNodes = nodePresentation ?? {};
  const headAlign =
    textNodes.subheadline?.align ??
    textNodes.headline?.align ??
    textNodes.copy?.align;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-tt-grid__head .site-eyebrow",
        tablet: textNodeDecls(
          textNodes.subheadline?.breakpoints?.tablet,
          eyebrowSize,
        ),
        mobile: textNodeDecls(
          textNodes.subheadline?.breakpoints?.mobile,
          eyebrowSize,
        ),
      },
      {
        selector: ".site-tt-grid__head .site-prim-head__headline",
        tablet: textNodeDecls(
          textNodes.headline?.breakpoints?.tablet,
          headingSize,
        ),
        mobile: textNodeDecls(
          textNodes.headline?.breakpoints?.mobile,
          headingSize,
        ),
      },
      {
        selector: ".site-tt-grid__head .site-prim-head__intro",
        tablet: textNodeDecls(textNodes.copy?.breakpoints?.tablet, paragraphSize),
        mobile: textNodeDecls(textNodes.copy?.breakpoints?.mobile, paragraphSize),
      },
    ],
  });

  const gridStyle: CSSProperties = {
    display: "grid",
    gap: "clamp(12px, 1.6vw, 20px)",
    gridTemplateColumns: colsFor(desktopLayout),
    marginTop: "clamp(20px, 3vw, 36px)",
  };
  if (isRailLayout) {
    delete gridStyle.gridTemplateColumns;
  }

  return (
    <section
      className="site-tt-grid"
      data-tt-desktop={desktopLayout}
      data-tt-mobile={mobileLayout}
      data-tt-images={shouldShowImages ? "on" : "off"}
      data-tt-icons={shouldShowIcons ? "on" : "off"}
      data-tt-overlay={imageOverlayStrength ?? "medium"}
      data-tt-card-title-scale={cardTitleScale ?? "balanced"}
      data-tt-card-copy-scale={cardCopyScale ?? "comfortable"}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <Container width={isRailLayout ? "wide" : "standard"}>
        <div className="site-tt-grid__head">
          <SectionHead
            eyebrow={eyebrow ? renderInlineRich(eyebrow) : undefined}
            headline={headline ? renderInlineRich(headline) : undefined}
            intro={subheadline ? renderInlineRich(subheadline) : undefined}
            align={headAlign === "center" ? "center" : "start"}
            eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
            headlineBuilderNodeId={nodeIdsByRole?.headline}
            introBuilderNodeId={nodeIdsByRole?.copy}
            eyebrowStyle={textNodeStyle(textNodes.subheadline, eyebrowSize)}
            headlineStyle={textNodeStyle(textNodes.headline, headingSize)}
            introStyle={textNodeStyle(textNodes.copy, paragraphSize)}
          />
          {seeAllLabel && seeAllHref ? (
            <Cta
              href={resolveLinkLike(seeAllHref, linkCtx).href}
              variant="text"
              size="sm"
              iconRight={
                isRailLayout ? <span aria-hidden="true">→</span> : undefined
              }
            >
              {seeAllLabel}
            </Cta>
          ) : null}
        </div>

        {cards.length === 0 ? (
          <p className="site-tt-grid__empty" role="status">
            {emptyStateText && emptyStateText.trim().length > 0
              ? emptyStateText
              : "No talent disciplines to show yet."}
          </p>
        ) : (
          <div className="site-tt-grid__railwrap">
            {shouldShowRailControls ? (
              <TalentTypeGridRailControls targetId={railId} />
            ) : null}
            <div
              id={railId}
              className="site-tt-grid__grid"
              style={gridStyle}
              data-tt-rail={
                isRailLayout || mobileLayout === "horizontal-scroll"
                  ? "on"
                  : undefined
              }
            >
              {displayCards.map((c, i) => (
                <a
                  key={c.key}
                  href={c.href}
                  className="site-tt-card"
                  data-tt-featured={
                    isFeaturedPodLayout && i === 0 ? "true" : undefined
                  }
                  data-tt-text={textPosition}
                  style={
                    desktopLayout === "editorial-asymmetric" &&
                    i === featuredIndex
                      ? { gridColumn: "span 2", gridRow: "span 2" }
                      : undefined
                  }
                  aria-label={c.label}
                >
                  {shouldShowImages ? (
                    <MediaFrame
                      src={c.imageUrl ?? null}
                      alt={c.imageAlt ?? c.description ?? c.label}
                      ratio={cardRatio ?? "3/4"}
                      overlayOpacity={isRailLayout ? 0 : overlayOpacity}
                      overlayStrength={
                        isRailLayout
                          ? "none"
                          : (imageOverlayStrength ?? "medium")
                      }
                      objectPosition={c.imagePosition}
                      fallback={c.label}
                      className="site-tt-card__media"
                    />
                  ) : (
                    <span className="site-tt-card__blank" aria-hidden="true" />
                  )}
                  <span className="site-tt-card__content">
                    {shouldShowIcons && c.icon ? (
                      <span className="site-tt-card__icon" aria-hidden="true">
                        {renderCardIcon(c.icon)}
                      </span>
                    ) : null}
                    <span className="site-tt-card__copy">
                      <span className="site-tt-card__label">{c.label}</span>
                      {showCount && typeof c.count === "number" ? (
                        <span className="site-tt-card__count">{c.count}</span>
                      ) : null}
                      {shouldShowDescriptions && c.description ? (
                        <span className="site-tt-card__desc">
                          {c.description}
                        </span>
                      ) : null}
                      {showCta ? (
                        <span className="site-tt-card__cta">
                          {ctaLabel && ctaLabel.length > 0
                            ? ctaLabel
                            : "Explore"}
                          <span aria-hidden="true">→</span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
