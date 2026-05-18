import type { CSSProperties } from "react";

import { presentationDataAttrs } from "../shared/presentation";
import { Container, SectionHead, Cta, MediaFrame } from "../shared/section-primitives";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import type { SectionComponentProps } from "../types";
import type { TalentTypeGridV1 } from "./schema";
import { fetchTenantTalentCategories } from "./fetch";

type Card = {
  key: string;
  label: string;
  description?: string;
  imageUrl?: string;
  href: string;
  count?: number;
};

function colsFor(layout: TalentTypeGridV1["desktopLayout"]): string {
  if (layout === "compact-grid")
    return "repeat(auto-fill, minmax(180px, 1fr))";
  if (layout === "editorial-asymmetric")
    return "repeat(auto-fill, minmax(240px, 1fr))";
  return "repeat(auto-fill, minmax(220px, 1fr))";
}

export async function TalentTypeGridComponent({
  props,
  tenantId,
  locale,
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
      imageUrl: it.imageUrl,
      href: dirHref(it.taxonomyTermId, it.href),
    }));
  }

  const gridStyle: CSSProperties = {
    display: "grid",
    gap: "clamp(12px, 1.6vw, 20px)",
    gridTemplateColumns: colsFor(desktopLayout),
    marginTop: "clamp(20px, 3vw, 36px)",
  };

  return (
    <section
      className="site-tt-grid"
      data-tt-desktop={desktopLayout}
      data-tt-mobile={mobileLayout}
      {...presentationDataAttrs(presentation)}
    >
      <Container width="standard">
        <div className="site-tt-grid__head">
          <SectionHead
            eyebrow={eyebrow}
            headline={headline}
            intro={subheadline}
          />
          {seeAllLabel && seeAllHref ? (
            <Cta
              href={prefixPublicHref(seeAllHref, publicPathPrefix)}
              variant="text"
              size="sm"
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
          <div style={gridStyle} data-tt-rail={mobileLayout === "horizontal-scroll" ? "on" : undefined}>
            {cards.map((c, i) => (
              <a
                key={c.key}
                href={c.href}
                className="site-tt-card"
                style={
                  desktopLayout === "editorial-asymmetric" && i === 0
                    ? { gridColumn: "span 2", gridRow: "span 2" }
                    : undefined
                }
                aria-label={c.label}
              >
                <MediaFrame
                  src={c.imageUrl ?? null}
                  alt={c.label}
                  ratio={cardRatio ?? "3/4"}
                  overlayOpacity={overlayOpacity}
                  overlayStrength={imageOverlayStrength ?? "medium"}
                  fallback={c.label}
                  caption={
                    textPosition === "overlay-bottom" ? (
                      <span className="site-tt-card__cap">
                        <span className="site-tt-card__label">{c.label}</span>
                        {showCount && typeof c.count === "number" ? (
                          <span className="site-tt-card__count">
                            {c.count}
                          </span>
                        ) : null}
                      </span>
                    ) : undefined
                  }
                />
                {textPosition === "below" ? (
                  <span className="site-tt-card__below">
                    <span className="site-tt-card__label">{c.label}</span>
                    {showCount && typeof c.count === "number" ? (
                      <span className="site-tt-card__count">{c.count}</span>
                    ) : null}
                    {c.description ? (
                      <span className="site-tt-card__desc">
                        {c.description}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {showCta ? (
                  <span className="site-tt-card__cta">
                    {ctaLabel && ctaLabel.length > 0 ? ctaLabel : "Explore"}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
