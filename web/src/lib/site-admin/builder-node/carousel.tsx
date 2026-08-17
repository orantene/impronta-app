"use client";

import {
  Children,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import {
  setCarouselSlide,
  useCarouselEditing,
  useCarouselPinnedSlide,
} from "./carousel-edit-bridge";

interface BuilderNodeCarouselTrackProps {
  nodeId: string;
  variant?: "rail" | "hero";
  // rail variant
  showArrows?: boolean;
  showDots?: boolean;
  // hero variant
  slideCount?: number;
  autoplayMs?: number;
  loop?: boolean;
  pauseOnHover?: boolean;
  controls?: {
    dots?: boolean;
    arrows?: boolean;
    progress?: boolean;
    counter?: boolean;
    scrollCue?: boolean;
  };
  children: ReactNode;
}

/**
 * One node, two interactive behaviors. The hero variant runs a real
 * autoplay/crossfade slider; the rail variant keeps the horizontal scroll-rail.
 * The dispatcher itself calls no hooks, so picking a branch by the (fixed) node
 * variant prop is safe.
 */
export function BuilderNodeCarouselTrack(props: BuilderNodeCarouselTrackProps) {
  if ((props.variant ?? "rail") === "hero") {
    return <HeroCarousel {...props} />;
  }
  return <RailCarousel {...props} />;
}

function HeroCarousel({
  nodeId,
  slideCount = 0,
  autoplayMs,
  loop,
  pauseOnHover,
  controls,
  children,
}: BuilderNodeCarouselTrackProps) {
  const count = slideCount || Children.count(children);
  const slidesRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  // EDIT MODE (carousel-edit-bridge). Both are inert on the published site:
  // `editing` is false and `pinned` is null unless an editor canvas is mounted.
  const editing = useCarouselEditing();
  const pinned = useCarouselPinnedSlide(nodeId);

  // The slide actually on screen. A pin from the inspector's slide manager
  // WINS over the internal index, which is what makes "click slide 3 in the
  // list, see slide 3 on the canvas" work. Clamped, because removing a slide
  // can leave a pin pointing past the end.
  const activeIndex =
    pinned !== null && count > 0 ? Math.min(pinned, count - 1) : index;

  function go(next: number) {
    const target =
      count <= 1
        ? 0
        : loop === false
          ? Math.max(0, Math.min(next, count - 1))
          : ((next % count) + count) % count;
    setIndex(target);
    // While editing, the canvas arrows/dots and the inspector's slide list are
    // two views of ONE choice — write through so they can never disagree.
    if (editing) setCarouselSlide(nodeId, target);
  }

  // Live reduced-motion preference (re-reads on change, unlike the read-once mockup).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  // Real autoplay.
  //
  // `editing` is the owner's #1 bug: on the editor canvas the slider used to
  // keep running, so a slide crossfaded out from under the pointer and slides
  // 2..N (which are `inert` while inactive) were never reachable long enough
  // to click. In edit mode autoplay simply does not start; the operator drives
  // it from the inspector's slide list, the canvas arrows, or the dots.
  useEffect(() => {
    if (editing || reduced || paused || !autoplayMs || count <= 1) return;
    const id = window.setInterval(() => {
      setIndex((cur) => {
        const next = cur + 1;
        if (loop === false) return next >= count ? cur : next;
        return next % count;
      });
    }, autoplayMs);
    return () => window.clearInterval(id);
  }, [editing, reduced, paused, autoplayMs, count, loop]);

  // Crossfade by toggling data-active on the server-rendered slide nodes.
  // Also toggle aria-hidden so assistive tech skips the inactive (invisible)
  // slides (WCAG 4.1.2) and exposes only the one on screen.
  useEffect(() => {
    const el = slidesRef.current;
    if (!el) return;
    const kids = el.children;
    for (let i = 0; i < kids.length; i += 1) {
      const kid = kids[i];
      if (!(kid instanceof HTMLElement)) continue;
      if (i === activeIndex) {
        kid.setAttribute("data-active", "");
        kid.removeAttribute("aria-hidden");
        kid.removeAttribute("inert");
      } else {
        kid.removeAttribute("data-active");
        kid.setAttribute("aria-hidden", "true");
        // `inert` also drops any focusable CTA inside the hidden slide out of
        // the tab order + a11y tree, so aria-hidden never wraps a focusable
        // descendant (which would itself be a WCAG 4.1.2 violation).
        kid.setAttribute("inert", "");
      }
    }
  }, [activeIndex]);

  // WCAG 2.4.7 / 2.1.1 — ArrowLeft/ArrowRight move between slides whenever the
  // carousel (slides container, dots, or arrows) holds keyboard focus.
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (count <= 1) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(activeIndex + 1);
    }
  }

  const ctl = controls ?? {};
  const padded = (n: number) => String(n).padStart(2, "0");
  const showMeta = (ctl.counter || ctl.progress || ctl.dots) && count > 1;

  return (
    // `display:contents` wrapper — adds focus/keyboard behavior to the whole
    // carousel WITHOUT introducing a box (the hero's absolute-positioned
    // slides/arrows/meta keep the carousel root as their containing block, so
    // layout is unchanged). focusin/focusout bubble here, so autoplay pauses
    // whenever any control inside takes keyboard focus (WCAG 2.2.2), and
    // ArrowLeft/Right navigate while focus is within (WCAG 2.1.1).
    <div
      style={{ display: "contents" }}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      <div
        className="site-bn-hero__slides"
        ref={slidesRef}
        role="group"
        aria-roledescription="carousel"
        aria-label="Highlights"
        onMouseEnter={pauseOnHover ? () => setPaused(true) : undefined}
        onMouseLeave={pauseOnHover ? () => setPaused(false) : undefined}
      >
        {children}
      </div>
      {ctl.arrows && count > 1 ? (
        <>
          <button
            type="button"
            className="site-bn-hero__arrow site-bn-hero__arrow--prev"
            aria-label="Previous slide"
            onClick={() => go(activeIndex - 1)}
          >
            {"‹"}
          </button>
          <button
            type="button"
            className="site-bn-hero__arrow site-bn-hero__arrow--next"
            aria-label="Next slide"
            onClick={() => go(activeIndex + 1)}
          >
            {"›"}
          </button>
        </>
      ) : null}
      {showMeta ? (
        <div className="site-bn-hero__meta">
          {ctl.counter ? (
            <span className="site-bn-hero__count">
              {padded(activeIndex + 1)} / {padded(count)}
            </span>
          ) : null}
          {ctl.progress ? (
            <span className="site-bn-hero__progress">
              <span
                className="site-bn-hero__progress-bar"
                style={{ width: `${((activeIndex + 1) / count) * 100}%` }}
              />
            </span>
          ) : null}
          {ctl.dots ? (
            <div className="site-bn-hero__dots">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={`${nodeId}:dot:${i}`}
                  type="button"
                  className="site-bn-hero__dot"
                  data-on={i === activeIndex ? "" : undefined}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === activeIndex ? "true" : undefined}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {ctl.scrollCue ? (
        <div className="site-bn-hero__cue" aria-hidden>
          <span>Scroll</span>
        </div>
      ) : null}
    </div>
  );
}

function RailCarousel({
  nodeId,
  showArrows,
  showDots,
  children,
}: BuilderNodeCarouselTrackProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const items = Children.toArray(children);
  // Editor-only: the inspector's slide list drives this rail too, so "click
  // slide 3" scrolls the rail to slide 3 instead of leaving the operator to
  // hunt for it in an overflow scroller. Null on the published site.
  const pinned = useCarouselPinnedSlide(nodeId);

  useEffect(() => {
    if (pinned === null) return;
    const track = trackRef.current;
    const slide = track?.children.item(pinned);
    if (!track || !(slide instanceof HTMLElement)) return;
    track.scrollTo({
      left: Math.max(0, slide.offsetLeft - track.offsetLeft),
      behavior: "smooth",
    });
  }, [pinned]);

  function scrollByPage(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    const delta = direction * Math.max(track.clientWidth * 0.85, 240);
    track.scrollLeft = Math.max(0, track.scrollLeft + delta);
  }

  function scrollToSlide(index: number) {
    const track = trackRef.current;
    const slide = track?.children.item(index);
    if (!track) return;
    if (!(slide instanceof HTMLElement)) return;
    track.scrollLeft = Math.max(0, slide.offsetLeft - track.offsetLeft);
  }

  return (
    <>
      {showArrows ? (
        <div className="site-builder-node--carousel-controls">
          <a
            href={`#${nodeId}-slide-1`}
            className="site-builder-node--carousel-arrow"
            aria-label="Previous slide"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              scrollByPage(-1);
            }}
          >
            {"<"}
          </a>
          <a
            href={`#${nodeId}-slide-${Math.min(items.length, 2)}`}
            className="site-builder-node--carousel-arrow"
            aria-label="Next slide"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              scrollByPage(1);
            }}
          >
            {">"}
          </a>
        </div>
      ) : null}
      <div ref={trackRef} className="site-builder-node--carousel-track">
        {items}
      </div>
      {showDots && items.length > 1 ? (
        <div className="site-builder-node--carousel-dots">
          {items.map((_, index) => (
            <a
              key={`${nodeId}:dot:${index}`}
              href={`#${nodeId}-slide-${index + 1}`}
              className="site-builder-node--carousel-dot"
              aria-label={`Go to slide ${index + 1}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                scrollToSlide(index);
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
