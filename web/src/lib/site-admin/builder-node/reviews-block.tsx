/**
 * Reviews block (W-14) — live-bound `talent_reviews` quote cards.
 * Layouts: trio · single · row on the shared carousel rail.
 * Hidden when there are no real quotes (never invents reviews).
 * Kept out of render.tsx to avoid growing the god file.
 */
"use client";

import type { CSSProperties, ReactNode } from "react";

import { BuilderNodeCarouselTrack } from "./carousel";
import { carouselSlideVars, type CarouselSlidesPerView } from "./carousel-slides-per-view";
import { REVIEWS_DEFAULT_PROPS, type ReviewsLayout } from "./reviews-defaults";
import { renderItalicMarkedTitle } from "./services-catalog-title";
import type { TalentSiteReview } from "./reviews-types";
import type { BuilderReviewsNode } from "./types";

export const REVIEWS_CSS = `
.sb-reviews{color:var(--token-color-ink);font:inherit;width:100%;min-width:0}
.sb-reviews[data-reviews-empty="1"]{display:none!important}
.sb-reviews-header{margin-bottom:1.25rem}
.sb-reviews-eyebrow{margin:0 0 0.35rem;font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-reviews-title{margin:0;font-size:clamp(1.35rem,2.5vw,1.85rem);font-weight:600;letter-spacing:-0.02em;line-height:1.15}
.sb-reviews .site-builder-node--carousel{width:100%;max-width:none;margin:0;display:grid;gap:0.75rem}
.sb-reviews .site-builder-node--carousel-track{width:100%;min-width:0;display:flex;gap:var(--bn-gap,1.1rem);overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
.sb-reviews .site-builder-node--carousel-slide{min-width:0;flex:0 0 var(--bn-slide-width,50%);scroll-snap-align:start}
.sb-reviews .site-builder-node--carousel-controls{display:flex;justify-content:flex-end;gap:0.5rem}
.sb-reviews .site-builder-node--carousel-arrow{display:inline-flex;height:2rem;width:2rem;align-items:center;justify-content:center;border:1px solid color-mix(in oklab,var(--token-color-ink) 16%,transparent);border-radius:999px;background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);font-weight:700;text-decoration:none}
.sb-reviews .site-builder-node--carousel-dots{display:flex;justify-content:center;gap:0.4rem}
.sb-reviews .site-builder-node--carousel-dot{height:0.45rem;width:0.45rem;border:0;border-radius:999px;background:color-mix(in oklab,var(--token-color-ink) 28%,transparent);padding:0;cursor:pointer}
.sb-reviews-card{display:flex;flex-direction:column;gap:1.1rem;min-height:14rem;height:100%;padding:1.65rem 1.4rem 1.35rem;border-radius:var(--site-radius-lg,1rem);border:1px solid var(--token-color-line);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);box-sizing:border-box}
.sb-reviews-card[data-accent="a"]{background:color-mix(in oklab,var(--token-color-accent,var(--token-color-primary)) 14%,var(--token-color-surface-raised,var(--token-color-background)));border-color:color-mix(in oklab,var(--token-color-accent,var(--token-color-primary)) 28%,var(--token-color-line))}
.sb-reviews-card[data-accent="b"]{background:color-mix(in oklab,var(--token-color-primary,var(--token-color-ink)) 8%,var(--token-color-surface-raised,var(--token-color-background)));border-color:color-mix(in oklab,var(--token-color-primary,var(--token-color-ink)) 18%,var(--token-color-line))}
.sb-reviews-card[data-accent="c"]{background:color-mix(in oklab,var(--token-color-muted) 18%,var(--token-color-surface-raised,var(--token-color-background)));border-color:color-mix(in oklab,var(--token-color-muted) 32%,var(--token-color-line))}
.sb-reviews-mark{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:2.4rem;line-height:0.8;color:color-mix(in oklab,var(--token-color-accent,var(--token-color-primary)) 55%,var(--token-color-muted));font-weight:400}
.sb-reviews-quote{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.05rem,1.5vw,1.3rem);line-height:1.4;font-weight:400;color:var(--token-color-ink)}
.sb-reviews-meta{margin-top:auto;padding-top:1rem;border-top:1px solid color-mix(in oklab,var(--token-color-ink) 14%,transparent);display:flex;flex-direction:column;gap:0.2rem}
.sb-reviews-who{display:flex;align-items:center;gap:10px}
.sb-reviews-initials{flex:0 0 auto;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:var(--token-color-blush,color-mix(in srgb,var(--token-color-accent,var(--token-color-ink)) 14%,transparent));color:var(--token-color-accent,var(--token-color-ink))}
.sb-reviews-demo{margin:0;font-size:12.5px;color:var(--token-color-muted)}
.sb-reviews-note{margin:-0.5rem 0 1rem;font-size:13px;color:var(--token-color-muted)}
.sb-reviews-author{margin:0;font-size:0.8125rem;font-weight:500;color:var(--token-color-primary,var(--token-color-ink))}
.sb-reviews-stars{margin:0;font-size:0.75rem;letter-spacing:0.08em;color:var(--token-color-muted)}
.sb-reviews[data-reviews-layout="single"] .site-builder-node--carousel-slide{flex-basis:var(--bn-slide-width,100%)}
.sb-reviews[data-reviews-layout="trio"] .sb-reviews-card{min-height:16rem}
@media (max-width:1024px){
  .sb-reviews .site-builder-node--carousel-slide{flex-basis:calc(100% / var(--bn-tablet-slides,2))}
}
@media (max-width:720px){
  .sb-reviews .site-builder-node--carousel-slide{flex-basis:var(--bn-mobile-slide-width,86%)}
  .sb-reviews-card{min-height:12.5rem;padding:1.35rem 1.15rem 1.15rem}
}
`;

const ACCENTS = ["a", "b", "c"] as const;

function starLabel(rating: number): string {
  const n = Math.max(1, Math.min(5, Math.round(rating)));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

function authorLabel(review: TalentSiteReview): string {
  return review.clientName?.trim() || "Client";
}

function slidesForLayout(layout: ReviewsLayout): {
  slidesPerView: CarouselSlidesPerView;
  responsive?: {
    tablet?: { slidesPerView?: CarouselSlidesPerView };
    mobile?: { slidesPerView?: CarouselSlidesPerView };
  };
} {
  if (layout === "single") {
    return {
      slidesPerView: 1,
      responsive: { tablet: { slidesPerView: 1 }, mobile: { slidesPerView: 1 } },
    };
  }
  if (layout === "trio") {
    return {
      slidesPerView: 3,
      responsive: { tablet: { slidesPerView: 2 }, mobile: { slidesPerView: 1 } },
    };
  }
  // row — peeking rail
  return {
    slidesPerView: 2,
    responsive: { tablet: { slidesPerView: 2 }, mobile: { slidesPerView: 1 } },
  };
}

function initialsOf(name: string): string {
  const parts = name.replace(/\./g, " ").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "·";
}

function QuoteCard({
  review,
  accent,
  showRating,
  es,
}: {
  review: TalentSiteReview;
  accent: (typeof ACCENTS)[number];
  showRating: boolean;
  es: boolean;
}) {
  return (
    <blockquote
      className="sb-reviews-card"
      data-accent={accent}
      data-review-id={review.id}
    >
      <p className="sb-reviews-mark" aria-hidden>
        {"\u201C"}
      </p>
      <p className="sb-reviews-quote">{review.body}</p>
      <footer className="sb-reviews-meta">
        <span className="sb-reviews-who">
          <span className="sb-reviews-initials" aria-hidden="true">
            {initialsOf(authorLabel(review))}
          </span>
          <span>
            <cite className="sb-reviews-author">{authorLabel(review)}</cite>
            {review.demo ? (
              <p className="sb-reviews-demo">{es ? "Reseña de demo" : "Demo review"}</p>
            ) : null}
          </span>
        </span>
        {showRating ? (
          <p className="sb-reviews-stars" aria-label={`${review.rating} out of 5`}>
            {starLabel(review.rating)}
          </p>
        ) : null}
      </footer>
    </blockquote>
  );
}

/**
 * Client component boundary for W-14. Must be rendered as JSX from
 * `render.tsx` — never called as a function on the server (RSC error).
 */
export function ReviewsBlockView({
  node,
  reviews,
  styleAttr,
}: {
  node: BuilderReviewsNode;
  reviews: ReadonlyArray<TalentSiteReview>;
  styleAttr?: CSSProperties;
  locale?: string;
}): ReactNode {
  const p = args.node.props;
  const es = (args.locale ?? "").toLowerCase().startsWith("es");
  const layout = (p.layout ?? REVIEWS_DEFAULT_PROPS.layout) as ReviewsLayout;
  const limit = Math.max(1, Math.min(24, p.limit ?? REVIEWS_DEFAULT_PROPS.limit ?? 12));
  const visible = reviews.filter((r) => r.body.trim()).slice(0, limit);
  const title = (p.title ?? REVIEWS_DEFAULT_PROPS.title)?.trim() || "What clients say";
  const eyebrow = p.eyebrow?.trim() || "";

  // Hidden when no real quotes (never invent reviews). Still emit the kind
  // stamp so insert/drop/registration stays discoverable, matching next_free_chip.
  if (visible.length === 0) {
    return (
      <section
        data-builder-node-kind="reviews"
        data-reviews-layout={layout}
        data-reviews-empty="1"
        className="sb-reviews"
        style={styleAttr}
        hidden
        aria-hidden="true"
      >
        <style>{REVIEWS_CSS}</style>
      </section>
    );
  }

  const showRating = p.showRating !== false;
  const autoplayMs =
    p.autoplayMs === 0
      ? undefined
      : (p.autoplayMs ?? REVIEWS_DEFAULT_PROPS.autoplayMs);
  const loop = p.loop !== false;
  const showArrows = p.showArrows === true;
  const showDots = p.showDots !== false && visible.length > 1;
  const slideCfg = slidesForLayout(layout);
  const carouselVars = carouselSlideVars({
    slidesPerView: slideCfg.slidesPerView,
    responsive: slideCfg.responsive,
  });

  return (
    <section
      data-builder-node-kind="reviews"
      data-reviews-layout={layout}
      className="sb-reviews"
      style={{
        ...styleAttr,
        ["--bn-slide-width" as string]: carouselVars.slideWidth,
        ["--bn-tablet-slides" as string]: carouselVars.tabletSlides,
        ...(carouselVars.mobileSlideWidth
          ? { ["--bn-mobile-slide-width" as string]: carouselVars.mobileSlideWidth }
          : {}),
      }}
    >
      <style>{REVIEWS_CSS}</style>
      <header className="sb-reviews-header">
        {eyebrow ? <p className="sb-reviews-eyebrow">{eyebrow}</p> : null}
        <h2 className="sb-reviews-title">{renderItalicMarkedTitle(title)}</h2>
      </header>
      {visible.every((r) => r.demo) ? (
        <p className="sb-reviews-note">
          {es
            ? "Reseñas de demo, con iniciales. En un sitio real solo aparecen reseñas de citas completadas."
            : "Demo reviews, with initials. A real site only shows reviews from completed appointments."}
        </p>
      ) : null}
      <div
        className="site-builder-node site-builder-node--carousel"
        data-builder-carousel-loop={loop ? "true" : undefined}
        data-builder-carousel-autoplay-ms={autoplayMs}
      >
        <BuilderNodeCarouselTrack
          nodeId={node.id}
          variant="rail"
          showArrows={showArrows}
          showDots={showDots}
          autoplayMs={autoplayMs}
          loop={loop}
          pauseOnHover
        >
          {visible.map((review, index) => (
            <div
              key={review.id}
              id={`${node.id}-slide-${index + 1}`}
              className="site-builder-node--carousel-slide"
            >
              <QuoteCard
                review={review}
                accent={ACCENTS[index % ACCENTS.length]}
                showRating={showRating}
                es={es}
              />
            </div>
          ))}
        </BuilderNodeCarouselTrack>
      </div>
    </section>
  );
}

/** Client-component form: the server renderer must render this file's output
 *  as a component, not call its functions (it is a "use client" module). */
export function ReviewsBlockView(props: Parameters<typeof renderReviewsBlock>[0]): ReactNode {
  return renderReviewsBlock(props);
}
