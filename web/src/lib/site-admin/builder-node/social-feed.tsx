"use client";

/**
 * SocialFeedWidget — the interactive half of the `social_feed` builder node.
 *
 * Four premium presets on ONE data model:
 *   grid     — clean N-column grid, uniform aspect
 *   masonry  — CSS-columns waterfall (native, no JS measurement)
 *   slider   — horizontal scroll-snap rail: swipe on touch, arrows on desktop
 *   stories  — tall 9:16 cards in a snap rail (Reels / Stories look)
 *
 * Performance rules (this sits on tenant HOME pages):
 *   - Media is plain <img>/<video>, never provider iframes. 12 Instagram
 *     iframes would each pull Meta's full embed bundle; 12 <img> tags cost
 *     almost nothing. This is exactly how the paid feed plugins stay fast.
 *   - Native `loading="lazy"` + `decoding="async"` on every non-first item.
 *   - Videos autoplay muted ONLY while on screen (IntersectionObserver pauses
 *     them off-screen) and never before user-visible.
 *   - "Load more" reveals items already in the DOM payload? No — items beyond
 *     `initialCount` are NOT rendered until revealed, so the initial HTML stays
 *     small. Reveal = button click or auto (sentinel IntersectionObserver).
 *
 * A11y: lightbox is a dialog with focus trap-lite (Escape closes, arrows
 * navigate); items are links (permalink) or buttons (lightbox) — never dead
 * tiles; reduced-motion disables hover zoom + autoplay.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type SocialFeedItem = {
  id: string;
  mediaUrl: string;
  mediaType?: "image" | "video";
  posterUrl?: string;
  permalink?: string;
  caption?: string;
};

export interface SocialFeedWidgetProps {
  nodeId: string;
  layout: "grid" | "masonry" | "slider" | "stories";
  provider: "instagram" | "tiktok" | "mixed";
  handle?: string;
  columns: number;
  initialCount: number;
  gap: "none" | "sm" | "md" | "lg";
  aspect: "square" | "portrait" | "video" | "auto";
  hover: "none" | "zoom" | "caption" | "zoom-caption";
  lightbox: boolean;
  loadMore: "button" | "auto" | "none";
  autoplayVideos: boolean;
  items: SocialFeedItem[];
}

const GAP_PX = { none: 0, sm: 6, md: 12, lg: 20 } as const;
const ASPECT = {
  square: "1 / 1",
  portrait: "4 / 5",
  video: "16 / 9",
  auto: undefined,
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Muted-autoplay video that plays only while visible. */
function FeedVideo({
  item,
  autoplay,
  className,
}: {
  item: SocialFeedItem;
  autoplay: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !autoplay || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoplay]);
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- decorative feed
    // loop, muted by design; the caption text renders beside/over the tile.
    <video
      ref={ref}
      className={className}
      src={item.mediaUrl}
      poster={item.posterUrl}
      muted
      loop
      playsInline
      preload="metadata"
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}

function ProviderMark({ provider }: { provider: SocialFeedWidgetProps["provider"] }) {
  if (provider === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
        <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.77.12V9.77a5.76 5.76 0 0 0-.77-.05 5.68 5.68 0 1 0 5.68 5.68V9.29a7.35 7.35 0 0 0 4.28 1.37V7.57a4.31 4.31 0 0 1-3.22-1.75Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SocialFeedWidget({
  nodeId,
  layout,
  provider,
  handle,
  columns,
  initialCount,
  gap,
  aspect,
  hover,
  lightbox,
  loadMore,
  autoplayVideos,
  items,
}: SocialFeedWidgetProps) {
  // Rails show everything (they scroll); grid/masonry reveal progressively.
  const progressive = layout === "grid" || layout === "masonry";
  const [visibleCount, setVisibleCount] = useState(
    progressive ? Math.min(initialCount, items.length) : items.length,
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(
    () => items.slice(0, progressive ? visibleCount : items.length),
    [items, progressive, visibleCount],
  );
  const hasMore = progressive && visibleCount < items.length;

  const revealMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + Math.max(columns * 2, 6), items.length));
  }, [columns, items.length]);

  // Auto load-more: reveal when the sentinel scrolls into view.
  useEffect(() => {
    if (!hasMore || loadMore !== "auto") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) revealMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, revealMore]);

  // Lightbox keyboard nav.
  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i === null ? i : Math.min(i + 1, items.length - 1)));
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) => (i === null ? i : Math.max(i - 1, 0)));
    }
    document.addEventListener("keydown", onKey);
    // Scroll lock while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightboxIndex, items.length]);

  const gapPx = GAP_PX[gap];
  const isRail = layout === "slider" || layout === "stories";
  const tileAspect = layout === "stories" ? "9 / 16" : ASPECT[aspect];

  const scrollRail = useCallback((dir: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: dir * Math.round(rail.clientWidth * 0.85),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  function tileInner(item: SocialFeedItem, index: number) {
    const media =
      item.mediaType === "video" ? (
        <FeedVideo
          item={item}
          autoplay={autoplayVideos}
          className="sf-media"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- remote social
        // media; next/image would proxy third-party URLs through the optimizer
        // (quota-billed) and needs width/height we don't have.
        <img
          className="sf-media"
          src={item.mediaUrl}
          alt={item.caption ?? "Social post"}
          loading={index < Math.min(columns, 4) ? "eager" : "lazy"}
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      );
    const showCaption = hover === "caption" || hover === "zoom-caption";
    return (
      <>
        {media}
        <span className="sf-tile-overlay" aria-hidden>
          <span className="sf-tile-provider">
            <ProviderMark provider={item.mediaType === "video" && provider === "mixed" ? "tiktok" : provider} />
          </span>
          {showCaption && item.caption ? (
            <span className="sf-tile-caption">{item.caption}</span>
          ) : null}
        </span>
      </>
    );
  }

  function tile(item: SocialFeedItem, index: number) {
    const style: React.CSSProperties = {
      aspectRatio: layout === "masonry" ? undefined : tileAspect,
    };
    if (lightbox) {
      return (
        <button
          key={item.id}
          type="button"
          className="sf-tile"
          style={style}
          onClick={() => setLightboxIndex(index)}
          aria-label={item.caption ? `Open post: ${item.caption}` : "Open post"}
        >
          {tileInner(item, index)}
        </button>
      );
    }
    const href = item.permalink;
    if (href) {
      return (
        <a
          key={item.id}
          className="sf-tile"
          style={style}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {tileInner(item, index)}
        </a>
      );
    }
    return (
      <span key={item.id} className="sf-tile" style={style}>
        {tileInner(item, index)}
      </span>
    );
  }

  const active = lightboxIndex !== null ? items[lightboxIndex] : null;

  return (
    <div
      className={`sf-root sf-layout-${layout} sf-hover-${hover}`}
      data-social-feed=""
      data-social-feed-node={nodeId}
      style={{ "--sf-gap": `${gapPx}px`, "--sf-cols": columns } as React.CSSProperties}
    >
      {handle ? (
        <div className="sf-header">
          <span className="sf-header-mark">
            <ProviderMark provider={provider} />
          </span>
          <span className="sf-header-handle">@{handle.replace(/^@/, "")}</span>
        </div>
      ) : null}

      {isRail ? (
        <div className="sf-rail-wrap">
          <div className="sf-rail" ref={railRef} role="list">
            {visible.map((item, i) => (
              <div className="sf-rail-cell" role="listitem" key={item.id}>
                {tile(item, i)}
              </div>
            ))}
          </div>
          {items.length > 1 ? (
            <>
              <button
                type="button"
                className="sf-arrow sf-arrow-prev"
                aria-label="Scroll back"
                onClick={() => scrollRail(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="sf-arrow sf-arrow-next"
                aria-label="Scroll forward"
                onClick={() => scrollRail(1)}
              >
                ›
              </button>
            </>
          ) : null}
        </div>
      ) : layout === "masonry" ? (
        <div className="sf-masonry">{visible.map((item, i) => tile(item, i))}</div>
      ) : (
        <div className="sf-grid">{visible.map((item, i) => tile(item, i))}</div>
      )}

      {hasMore && loadMore === "button" ? (
        <div className="sf-more-row">
          <button type="button" className="sf-more" onClick={revealMore}>
            Load more
          </button>
        </div>
      ) : null}
      {hasMore && loadMore === "auto" ? (
        <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
      ) : null}

      {active
        ? createPortal(
            <div
              className="sf-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Post viewer"
              onClick={() => setLightboxIndex(null)}
            >
              <figure
                className="sf-lightbox-figure"
                onClick={(e) => e.stopPropagation()}
              >
                {active.mediaType === "video" ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption -- see FeedVideo
                  <video
                    src={active.mediaUrl}
                    poster={active.posterUrl}
                    controls
                    autoPlay
                    playsInline
                    className="sf-lightbox-media"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- see above
                  <img
                    src={active.mediaUrl}
                    alt={active.caption ?? "Social post"}
                    className="sf-lightbox-media"
                  />
                )}
                {(active.caption || active.permalink) && (
                  <figcaption className="sf-lightbox-caption">
                    {active.caption ? <span>{active.caption}</span> : null}
                    {active.permalink ? (
                      <a
                        href={active.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {provider === "tiktok" ? "View on TikTok" : "View on Instagram"}
                      </a>
                    ) : null}
                  </figcaption>
                )}
              </figure>
              <button
                type="button"
                className="sf-lightbox-close"
                aria-label="Close viewer"
                onClick={() => setLightboxIndex(null)}
              >
                ×
              </button>
              {lightboxIndex !== null && lightboxIndex > 0 ? (
                <button
                  type="button"
                  className="sf-lightbox-nav sf-lightbox-prev"
                  aria-label="Previous post"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((i) => (i === null ? i : i - 1));
                  }}
                >
                  ‹
                </button>
              ) : null}
              {lightboxIndex !== null && lightboxIndex < items.length - 1 ? (
                <button
                  type="button"
                  className="sf-lightbox-nav sf-lightbox-next"
                  aria-label="Next post"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((i) => (i === null ? i : i + 1));
                  }}
                >
                  ›
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
