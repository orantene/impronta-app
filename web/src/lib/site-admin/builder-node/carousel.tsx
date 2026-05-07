"use client";

import {
  Children,
  useRef,
  type ReactNode,
} from "react";

interface BuilderNodeCarouselTrackProps {
  nodeId: string;
  showArrows?: boolean;
  showDots?: boolean;
  children: ReactNode;
}

export function BuilderNodeCarouselTrack({
  nodeId,
  showArrows,
  showDots,
  children,
}: BuilderNodeCarouselTrackProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const items = Children.toArray(children);

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
