import type { CSSProperties } from "react";

import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import {
  Container,
  SectionHead,
  Cta,
  MediaFrame,
} from "../shared/section-primitives";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
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
    emptyStateText,
    presentation,
  } = props;

  const dirHref = (termId?: string, override?: string): string => {
    const raw = override
      ? override
      : termId
        ? `/directory?tax=${encodeURIComponent(termId)}`
        : "/directory";
    return prefixPublicHref(raw, publicPathPrefix);
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
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width={isRailLayout ? "wide" : "standard"}>
        <div className="site-tt-grid__head">
          <SectionHead
            eyebrow={eyebrow}
            headline={headline}
            intro={subheadline}
            align="start"
          />
          {seeAllLabel && seeAllHref ? (
            <Cta
              href={prefixPublicHref(seeAllHref, publicPathPrefix)}
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
