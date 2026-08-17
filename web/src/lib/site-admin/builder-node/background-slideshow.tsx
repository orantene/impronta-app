"use client";

/**
 * background-slideshow.tsx — the rotating half of a container's background.
 *
 * WHY A CLIENT COMPONENT AND NOT A CSS ANIMATION. A pure-CSS crossfade needs
 * keyframe PERCENTAGES that depend on the slide count (each image is visible
 * 1/n of the cycle), and percentages cannot come from a CSS custom property.
 * The only CSS-only versions are "emit a per-node <style> block" or "hardcode a
 * keyframe set per count", and both are worse than the component the codebase
 * already has a precedent for: `carousel.tsx` drives the hero crossfade from
 * React for exactly the same reason.
 *
 * WHAT THE SERVER EMITS. Every image, absolutely stacked, with `data-active` on
 * the FIRST one. That is the whole no-JS / pre-hydration rendering: image 1
 * under the scrim, no empty hole, no layout shift when React takes over. The
 * rest of this file only ever moves `data-active`.
 *
 * REDUCED MOTION IS ENFORCED TWICE, ON PURPOSE.
 *   - CSS (`BACKGROUND_MEDIA_CSS`) hides every non-active slide and kills the
 *     transition, so the correct still is painted before any JS runs;
 *   - this component never starts its timer, so the pixels never change.
 * The CSS alone would leave the timer swapping which image is displayed; the JS
 * alone would flash a dissolve before hydration. Both, and it is a still.
 *
 * EDIT MODE reuses #1203's `carousel-edit-bridge` rather than a second store:
 * `useEditCanvasMotionPaused()` stops the rotation while an editor canvas is
 * mounted, and the `"background"` pin channel lets the inspector's slide list
 * hold the canvas on the image the operator is working against. Both are inert
 * on the published site — nothing there ever calls the writers.
 */
import { useEffect, useState } from "react";

import {
  useEditCanvasMotionPaused,
  usePinnedSlide,
} from "./carousel-edit-bridge";
import type { ResolvedBackgroundSlide } from "./background-media";

export function BackgroundSlideshow({
  nodeId,
  slides,
  intervalMs,
}: {
  nodeId: string;
  slides: readonly ResolvedBackgroundSlide[];
  intervalMs: number;
}) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const editing = useEditCanvasMotionPaused();
  const pinned = usePinnedSlide("background", nodeId);

  // Live preference, re-read on change — a visitor who flips the OS setting
  // while the page is open gets the still without a reload.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (editing || reduced || slides.length <= 1) return;
    const id = window.setInterval(
      () => setIndex((cur) => (cur + 1) % slides.length),
      intervalMs,
    );
    return () => window.clearInterval(id);
  }, [editing, reduced, slides.length, intervalMs]);

  // A pin WINS over the internal index — that is what makes "click image 3 in
  // the inspector, see image 3 on the canvas" work. Clamped, because removing
  // an image can leave a pin pointing past the end.
  const active =
    pinned !== null ? Math.min(pinned, slides.length - 1) : index % slides.length;

  return (
    <>
      {slides.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- decorative background; the optimizer has no localPatterns rule for tenant storage paths and never follows a redirect (#1172).
        <img
          key={`${nodeId}:bg-slide:${i}`}
          className="site-builder-bg-media__slide"
          data-active={i === active ? "" : undefined}
          src={slide.url}
          alt=""
          aria-hidden="true"
          // Only the first image is on the critical path. Everything after it
          // is fetched lazily, so a ten-image backdrop costs one image at load
          // instead of ten.
          loading={i === 0 ? "eager" : "lazy"}
          fetchPriority={i === 0 ? "high" : "low"}
          decoding="async"
          draggable={false}
          style={{ objectPosition: slide.focalPoint }}
        />
      ))}
    </>
  );
}
