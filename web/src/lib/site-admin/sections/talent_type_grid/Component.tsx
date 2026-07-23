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

function renderCardIcon(icon?: string) {
  switch (icon) {
    // ───────── Existing curated set ─────────
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
            strokeWidth="1.7"
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
            strokeWidth="1.6"
          />
          <circle
            cx="17.2"
            cy="10.5"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle
            cx="14.8"
            cy="16.7"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle
            cx="8.1"
            cy="16.2"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle
            cx="6.8"
            cy="9.8"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
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
            strokeWidth="1.6"
          />
        </svg>
      );

    // ───────── Visual / Camera / Film ─────────
    // Camera (photographers)
    case "▣":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M9 5.6l-.9 1.6H4.6a1.4 1.4 0 0 0-1.4 1.4v8.6a1.4 1.4 0 0 0 1.4 1.4h14.8a1.4 1.4 0 0 0 1.4-1.4V8.6a1.4 1.4 0 0 0-1.4-1.4h-3.5L14.8 5.6z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <circle
            cx="12"
            cy="13"
            r="3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="17.4" cy="9.6" r="0.7" fill="currentColor" />
        </svg>
      );
    // Film clapper (film / video)
    case "▤":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect
            x="3.4"
            y="9.4"
            width="17.2"
            height="10.2"
            rx="1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M3.4 6.4l2.4-2.1 2.3 2.6-2.4 2.1zM7.6 6.7l2.4-2.1 2.3 2.6-2.4 2.1zM11.8 7.1l2.4-2.1 2.3 2.6-2.4 2.1zM16 7.4l2.4-2.1 2.3 2.6-2.4 2.1z"
            fill="currentColor"
          />
        </svg>
      );

    // ───────── Visual artist / Makeup ─────────
    // Palette (paint / visual artist)
    case "◐":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 3.4c-4.8 0-8.6 3.6-8.6 8 0 4.1 3.2 7.2 7.4 7.2 1.1 0 1.8-.6 1.8-1.5 0-.4-.2-.7-.5-1-.3-.3-.5-.6-.5-1 0-.9.8-1.6 1.8-1.6h2.4c2.6 0 4.6-1.9 4.6-4.4 0-3.1-3.6-5.7-8.4-5.7z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <circle cx="7.5" cy="10" r="1" fill="currentColor" />
          <circle cx="11" cy="7.4" r="1" fill="currentColor" />
          <circle cx="15.2" cy="8.4" r="1" fill="currentColor" />
          <circle cx="16.4" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    // Makeup brush
    case "❁":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M14.6 4.2l5.2 5.2-7.6 7.6-2.6.7-2.6.7.7-2.6.7-2.6z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M14.6 4.2l5.2 5.2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
          <path
            d="M5.4 19.6c1.4-1 2.4-1 3.4 0"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
          <path d="M14.2 9.2l4.4 4.4-3.2 1-2.2-2.2z" fill="currentColor" />
        </svg>
      );
    // Scissors (hair / styling)
    case "✂":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="6.6"
            cy="6.8"
            r="2.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle
            cx="6.6"
            cy="17.2"
            r="2.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8.5 8.4l11 7.2M8.5 15.6l11-7.2M11.5 12l8.5 0"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
      );

    // ───────── Performance / Voice / Movement ─────────
    // Microphone (hosts / voice / promo)
    case "◍":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect
            x="9"
            y="3.4"
            width="6"
            height="11"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M6 11.4a6 6 0 0 0 12 0"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
          <path
            d="M12 17.4v3.2M9 20.6h6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    // Theater masks (performers / actors)
    case "◔":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4.4 4.6c2.2-.4 5-.4 7.2.2.4 4-1.6 8.4-4.4 8.6-2.8.2-4.8-3.4-4.6-7.4 0-.6.4-1.2 1.8-1.4z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M12 7.2c2.2-.6 5-.8 7.4-.6.6 3.8-1 8.4-3.8 8.8-2.8.4-5-3-5.2-7-.1-.4.2-1 1.6-1.2z"
            fill="currentColor"
            opacity="0.85"
          />
          <circle cx="5.4" cy="7.6" r="0.6" fill="currentColor" />
          <circle cx="9" cy="7.4" r="0.6" fill="currentColor" />
        </svg>
      );
    // Dance / movement (figure)
    case "❂":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12.4" cy="4.6" r="1.8" fill="currentColor" />
          <path
            d="M12.4 6.6l-1.4 4.2-3.6 1M12.4 6.6l1.6 3.4 4.6.4M12.4 10.4l-2.8 4.2-1.8 5.4M12.4 10.4l1.6 5 3.4 4.4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );

    // ───────── Culinary / Athletic / Lifestyle ─────────
    // Chef's hat
    case "▲":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M6 14.6c-2-.4-3-2-3-3.6 0-2.2 1.8-3.8 4-3.8.3-1.8 2-3 4-3 1.4 0 2.6.6 3.4 1.6.6-.4 1.4-.6 2.2-.6 2.2 0 4 1.6 4 3.8 0 1.8-1.2 3.2-3 3.6"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M5.6 13.8h12.8v4.6a1.4 1.4 0 0 1-1.4 1.4H7a1.4 1.4 0 0 1-1.4-1.4z"
            fill="currentColor"
          />
        </svg>
      );
    // Dumbbell (athletes / fitness)
    case "▰":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M8.5 9.5h7v5h-7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M3.6 8.2v7.6M5.8 6.6v10.8M18.2 6.6v10.8M20.4 8.2v7.6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.7"
          />
          <path d="M6.6 11h2v2h-2zM15.4 11h2v2h-2z" fill="currentColor" />
        </svg>
      );
    // Leaf (wellness alt / lifestyle / nature)
    case "❋":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M20.2 3.6c-7.4 0-13 4.2-13 10.4 0 1.8.6 3.4 1.6 4.6 1.2-7.4 6-10.4 9.4-11.6-3 1.6-6.8 4.8-8.4 12.4 1.4 1 3.2 1.6 5.2 1.6 5.8 0 9.4-5 9.4-11 0-2.4-.6-4.4-1.6-6-.6-.2-1.6-.4-2.6-.4z"
            fill="currentColor"
          />
          <path
            d="M9.2 20l-3 1"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
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
