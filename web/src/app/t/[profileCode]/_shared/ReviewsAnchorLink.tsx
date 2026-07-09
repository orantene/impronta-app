"use client";

/**
 * ReviewsAnchorLink — the hero "★ 5.0 · N reviews" chip's anchor, as a tiny
 * client component shared by all four profile layouts.
 *
 * WHY NOT a plain <a href="#reviews">: on the public profile pages the
 * browser's NATIVE fragment navigation does not scroll (verified in-browser:
 * `location.hash = 'reviews'` updates the URL but window.scrollY stays 0 —
 * the page's load/fade scripts swallow the jump), while scrollIntoView works
 * reliably. So we keep the href for semantics/a11y/no-JS, and drive the
 * actual scroll ourselves on click.
 */

import type { CSSProperties, ReactNode } from "react";

export function ReviewsAnchorLink({
  className,
  style,
  children,
  targetId = "reviews",
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** The id of the reviews section wrapper; layouts all use "reviews". */
  targetId?: string;
}) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      style={style}
      onClick={(e) => {
        const el = document.getElementById(targetId);
        if (!el) return; // fall through to native behavior
        e.preventDefault();
        // Deliberately NO history/hash write: the App Router patches
        // pushState/replaceState and treats a hash write as navigation,
        // scrolling the page back to top and undoing the scroll below.
        //
        // Deliberately NOT behavior:"smooth": the profile layouts run
        // scroll-reveal animations (translateY fade-ins) that shift layout
        // mid-scroll, which makes Chrome abort a smooth scrollIntoView
        // before it reaches the target (verified in-browser). An instant
        // jump is immune.
        el.scrollIntoView({ behavior: "auto", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
