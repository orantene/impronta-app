"use client";

/**
 * useLauncherScrollCollapse — shrink the floating chat pill to an icon while
 * the visitor is scrolling down a narrow screen.
 *
 * Audit finding: on a 375px viewport the "Message {Agency}" pill is ~full
 * width and permanently parked over the bottom of the grid, so it covers an
 * entire row of talent cards and never yields. The launcher has to stay
 * reachable (it IS the inquiry cart), so the answer is to shrink it, not to
 * hide it: collapsed to a circle it still carries the glyph, the accent and
 * every avatar face, at roughly a third of the footprint.
 *
 * Behavior mirrors the pattern people already know from mobile app bars:
 * scrolling DOWN (reading, browsing past cards) collapses; scrolling UP
 * (looking for an action) or returning near the top expands again.
 *
 * Never collapses when: the panel is open, the pointer is not coarse / the
 * viewport is wide, or the visitor prefers reduced motion (for them the pill
 * simply stays put rather than animating on every scroll).
 */

import { useEffect, useRef, useState } from "react";

/** Ignore jitter below this many px of travel before flipping state. */
const DIRECTION_THRESHOLD_PX = 24;
/** Above this scroll depth we stop force-expanding at the top of the page. */
const TOP_ZONE_PX = 120;

export type CollapseDecision =
  | { kind: "unchanged" }
  | { kind: "set"; collapsed: boolean; lastY: number };

/**
 * Pure scroll->collapse decision, extracted so the behavior is unit-testable
 * without a DOM, a coarse pointer or a foregrounded tab.
 */
export function decideCollapse(y: number, lastY: number): CollapseDecision {
  if (y <= TOP_ZONE_PX) return { kind: "set", collapsed: false, lastY: y };
  const delta = y - lastY;
  if (Math.abs(delta) < DIRECTION_THRESHOLD_PX) return { kind: "unchanged" };
  return { kind: "set", collapsed: delta > 0, lastY: y };
}

export function useLauncherScrollCollapse(enabled: boolean): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      return;
    }
    if (typeof window === "undefined") return;

    lastY.current = window.scrollY;

    const evaluate = () => {
      ticking.current = false;
      const decision = decideCollapse(window.scrollY, lastY.current);
      if (decision.kind === "unchanged") return;
      lastY.current = decision.lastY;
      setCollapsed(decision.collapsed);
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      setCollapsed(false);
    };
  }, [enabled]);

  return collapsed;
}
